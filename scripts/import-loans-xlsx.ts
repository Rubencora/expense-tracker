import "dotenv/config";
import * as XLSX from "xlsx";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

interface ParsedLoanPeriod {
  period: number;
  payment: number | null;
  extraPayment: number | null;
  balanceOverride: number | null;
}

interface ParsedLoan {
  name: string;
  principal: number;
  monthlyRate: number;
  termMonths: number;
  startYear: number;
  startMonth: number;
  trackingMode: "SCHEDULE" | "PAYMENTS";
  notes: string;
  periods: ParsedLoanPeriod[];
}

/**
 * Parse loan data from a sheet.
 * Sheet structure:
 * - C7: principal
 * - C8: monthly rate
 * - C11: term months (fallback to C10 * 12 if not a number)
 * - A16: start date (Date object)
 * - Rows 16+: schedule (period in column B, data in other columns)
 */
function parseLoanSheet(
  sheet: XLSX.WorkSheet,
  name: string,
  trackingMode: "SCHEDULE" | "PAYMENTS"
): ParsedLoan | null {
  // Extract principal (C7)
  const principalCell = sheet["C7"];
  const principal =
    typeof principalCell?.v === "number" ? principalCell.v : null;
  if (principal === null) {
    console.error(`Error: Could not parse principal for "${name}"`);
    return null;
  }

  // Extract monthly rate (C8)
  const monthlyRateCell = sheet["C8"];
  const monthlyRate =
    typeof monthlyRateCell?.v === "number" ? monthlyRateCell.v : null;
  if (monthlyRate === null) {
    console.error(`Error: Could not parse monthly rate for "${name}"`);
    return null;
  }

  // Extract term months (C11, fallback to C10 * 12)
  let termMonths: number | null = null;
  const termCell = sheet["C11"];
  if (typeof termCell?.v === "number") {
    termMonths = termCell.v;
  } else {
    const c10Cell = sheet["C10"];
    if (typeof c10Cell?.v === "number") {
      termMonths = c10Cell.v * 12;
    }
  }
  if (termMonths === null) {
    console.error(`Error: Could not parse term months for "${name}"`);
    return null;
  }

  // Extract start date (A16)
  const startDateCell = sheet["A16"];
  let startYear: number | null = null;
  let startMonth: number | null = null;

  if (startDateCell?.v instanceof Date) {
    startYear = startDateCell.v.getFullYear();
    startMonth = startDateCell.v.getMonth() + 1;
  }

  if (startYear === null || startMonth === null) {
    console.error(`Error: Could not parse start date for "${name}"`);
    return null;
  }

  // Parse schedule rows (starting from row 16, while column B is numeric)
  const periods: ParsedLoanPeriod[] = [];

  for (let rowIndex = 16; rowIndex <= 100; rowIndex++) {
    const periodCell = sheet[`B${rowIndex}`];
    if (!periodCell || typeof periodCell.v !== "number") {
      break; // Stop when column B is not numeric
    }

    const period = periodCell.v;

    // For PAYMENTS mode: column H (actual) or I (planned) or E (theoretical for periods 1-8)
    let payment: number | null = null;
    if (trackingMode === "PAYMENTS") {
      const hCell = sheet[`H${rowIndex}`];
      const iCell = sheet[`I${rowIndex}`];
      const eCell = sheet[`E${rowIndex}`];

      if (typeof hCell?.v === "number") {
        payment = hCell.v;
      } else if (typeof iCell?.v === "number") {
        payment = iCell.v;
      } else if (period >= 1 && period <= 8 && typeof eCell?.v === "number") {
        // For periods 1-8, use theoretical amortization from E if H and I are empty
        payment = eCell.v;
      }
    }

    // For SCHEDULE mode: column F (extra)
    let extraPayment: number | null = null;
    if (trackingMode === "SCHEDULE") {
      const fCell = sheet[`F${rowIndex}`];
      if (typeof fCell?.v === "number") {
        extraPayment = fCell.v;
      }
    }

    // For SCHEDULE mode: column G (balance override only if literal, not formula)
    let balanceOverride: number | null = null;
    if (trackingMode === "SCHEDULE") {
      const gCell = sheet[`G${rowIndex}`];
      // A cell with numeric value and no formula is a literal
      if (typeof gCell?.v === "number" && !gCell.f) {
        balanceOverride = gCell.v;
      }
    }

    // Only add if payment is numeric (including 0) for PAYMENTS mode
    if (trackingMode === "PAYMENTS") {
      if (payment !== null) {
        periods.push({ period, payment, extraPayment: null, balanceOverride: null });
      }
    } else {
      // For SCHEDULE, add if we have extra payment or balance override
      if (extraPayment !== null || balanceOverride !== null) {
        periods.push({ period, payment: null, extraPayment, balanceOverride });
      }
    }
  }

  const notes =
    trackingMode === "PAYMENTS"
      ? "Importado de Excel 'Credito HoyTrabajas'"
      : "";

  return {
    name,
    principal,
    monthlyRate,
    termMonths,
    startYear,
    startMonth,
    trackingMode,
    notes,
    periods,
  };
}

async function main() {
  try {
    // Parse CLI arguments
    const args = process.argv.slice(2);
    let filePath = "../Estado Credito Apto Ruben Cordoba 2025.xlsx";
    let email = "";
    let dryRun = false;

    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--file" && i + 1 < args.length) {
        filePath = args[i + 1];
        i++;
      } else if (args[i] === "--email" && i + 1 < args.length) {
        email = args[i + 1];
        i++;
      } else if (args[i] === "--dry-run") {
        dryRun = true;
      }
    }

    if (!email) {
      console.error("Error: --email is required");
      process.exit(1);
    }

    // Find user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.error(`Error: User with email "${email}" not found`);
      process.exit(1);
    }

    console.log(`Loading Excel file: ${filePath}`);
    const workbook = XLSX.readFile(filePath, { cellDates: true });

    // Parse "Credito HoyTrabajas" sheet
    const aptSheet = workbook.Sheets["Credito HoyTrabajas"];
    if (!aptSheet) {
      console.error('Error: Sheet "Credito HoyTrabajas" not found in workbook');
      process.exit(1);
    }

    const aptLoan = parseLoanSheet(
      aptSheet,
      "Credito HoyTrabajas (Apto)",
      "PAYMENTS"
    );
    if (!aptLoan) {
      process.exit(1);
    }

    // Parse "Credito Carro" sheet
    const carroSheet = workbook.Sheets["Credito Carro"];
    if (!carroSheet) {
      console.error('Error: Sheet "Credito Carro" not found in workbook');
      process.exit(1);
    }

    const carroLoan = parseLoanSheet(carroSheet, "Credito Carro", "SCHEDULE");
    if (!carroLoan) {
      process.exit(1);
    }

    const loans = [aptLoan, carroLoan];

    if (dryRun) {
      console.log("\n=== DRY RUN SUMMARY ===\n");

      for (const loan of loans) {
        console.log(`Loan: ${loan.name}`);
        console.log(`  Principal: ${loan.principal.toLocaleString()} COP`);
        console.log(`  Monthly Rate: ${(loan.monthlyRate * 100).toFixed(3)}%`);
        console.log(`  Term: ${loan.termMonths} months`);
        console.log(`  Start: ${loan.startYear}-${String(loan.startMonth).padStart(2, "0")}`);
        console.log(`  Tracking Mode: ${loan.trackingMode}`);
        console.log(`  Periods to import: ${loan.periods.length}`);

        if (loan.periods.length > 0) {
          console.log("\n  Period Table:");
          console.log("  | Period | YYYY-MM | Payment | ExtraPayment | BalanceOverride |");
          console.log("  |--------|---------|---------|--------------|-----------------|");

          let paymentSum = 0;
          let paymentSumUpTo44 = 0;

          for (const period of loan.periods) {
            // Calculate month for display
            const periodDate = new Date(loan.startYear, loan.startMonth - 1, 1);
            periodDate.setMonth(periodDate.getMonth() + period.period - 1);
            const monthStr = `${periodDate.getFullYear()}-${String(periodDate.getMonth() + 1).padStart(2, "0")}`;

            const paymentStr = period.payment !== null
              ? period.payment.toLocaleString()
              : "-";
            const extraStr = period.extraPayment !== null
              ? period.extraPayment.toLocaleString()
              : "-";
            const balanceStr = period.balanceOverride !== null
              ? period.balanceOverride.toLocaleString()
              : "-";

            console.log(
              `  | ${String(period.period).padStart(6)} | ${monthStr} | ${paymentStr.padStart(7)} | ${extraStr.padStart(12)} | ${balanceStr.padStart(15)} |`
            );

            if (period.payment !== null) {
              paymentSum += period.payment;
              if (period.period <= 44) {
                paymentSumUpTo44 += period.payment;
              }
            }
          }

          if (loan.trackingMode === "PAYMENTS" && paymentSum > 0) {
            console.log(`\n  Total payments: ${paymentSum.toLocaleString()} COP`);
            if (paymentSumUpTo44 > 0) {
              console.log(`  Total payments (periods ≤ 44): ${paymentSumUpTo44.toLocaleString()} COP`);
            }
          }
        }

        console.log();
      }

      await prisma.$disconnect();
      return;
    }

    // Actual import
    console.log("\n=== IMPORTING ===\n");

    let loansCreated = 0;
    let loansUpdated = 0;
    let periodsUpserted = 0;

    for (const loan of loans) {
      // Find or create loan
      const existingLoan = await prisma.loan.findFirst({
        where: { userId: user.id, name: loan.name },
      });

      let loanRecord;

      if (existingLoan) {
        await prisma.loan.update({
          where: { id: existingLoan.id },
          data: {
            principal: loan.principal,
            monthlyRate: loan.monthlyRate,
            termMonths: loan.termMonths,
            startYear: loan.startYear,
            startMonth: loan.startMonth,
            trackingMode: loan.trackingMode,
            notes: loan.notes || null,
            isActive: true,
          },
        });
        loansUpdated++;
        loanRecord = existingLoan;
      } else {
        loanRecord = await prisma.loan.create({
          data: {
            userId: user.id,
            name: loan.name,
            principal: loan.principal,
            monthlyRate: loan.monthlyRate,
            termMonths: loan.termMonths,
            startYear: loan.startYear,
            startMonth: loan.startMonth,
            trackingMode: loan.trackingMode,
            notes: loan.notes || null,
            isActive: true,
          },
        });
        loansCreated++;
      }

      // Upsert periods
      for (const period of loan.periods) {
        await prisma.loanPeriod.upsert({
          where: {
            loanId_period: {
              loanId: loanRecord.id,
              period: period.period,
            },
          },
          create: {
            loanId: loanRecord.id,
            period: period.period,
            payment: period.payment,
            extraPayment: period.extraPayment,
            balanceOverride: period.balanceOverride,
          },
          update: {
            payment: period.payment,
            extraPayment: period.extraPayment,
            balanceOverride: period.balanceOverride,
          },
        });
        periodsUpserted++;
      }
    }

    console.log("=== IMPORT COMPLETE ===");
    console.log(`Loans created: ${loansCreated}`);
    console.log(`Loans updated: ${loansUpdated}`);
    console.log(`Periods upserted: ${periodsUpserted}`);

    await prisma.$disconnect();
  } catch (error) {
    console.error("Error during import:", error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
