import "dotenv/config";
import * as XLSX from "xlsx";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { DebtKind } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

interface ParsedMonth {
  year: number;
  month: number;
}

interface DebtRow {
  name: string;
  entries: Map<string, { balance: number; payment: number }>;
  sortOrder: number;
}

interface MonthData {
  year: number;
  month: number;
  salary: number;
  extraIncome: number;
}

interface DebtNoteItemData {
  label: string;
  amount: number;
  sortOrder: number;
}

interface DebtNoteGroupData {
  title: string;
  items: DebtNoteItemData[];
  sortOrder: number;
}

// Parse month header: "Nov.22", "Jan.23", Date objects, etc.
// Rows in column A that are section labels, not real debts.
const LABEL_ROWS = new Set(["tc", "cuota credito banco"]);

function parseMonthHeader(value: unknown): ParsedMonth | null {
  // Handle Date objects (first day of month from Jan 2025 onward)
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = value.getMonth() + 1;
    return { year, month };
  }

  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim().toLowerCase();

  // Map month abbreviations (case-insensitive, 3-letter prefix with special handling)
  const monthMap: Record<string, number> = {
    ene: 1,
    jan: 1,
    feb: 2,
    mar: 3,
    abr: 4,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    ago: 8,
    aug: 8,
    sep: 9,
    sept: 9,
    oct: 10,
    nov: 11,
    dic: 12,
    dec: 12,
  };

  // Match month abbreviation (3+ chars) followed by optional dot and 2-digit year
  // Handles: "Nov.22", "nov.22", "Nov22", "Sep.24", "Sept.24"
  const match = cleaned.match(/^([a-z]{3,4})\.?(\d{2})$/);
  if (!match) {
    return null;
  }

  const monthStr = match[1];
  const yearStr = match[2];
  const month = monthMap[monthStr];
  if (!month) {
    return null;
  }

  const year = 2000 + parseInt(yearStr, 10);
  return { year, month };
}

// Get debt kind and credit limit by name
function getDebtMetadata(
  name: string
): { kind: DebtKind; creditLimit: number | null } {
  const nameNorm = name.toLowerCase().trim();

  // Credit cards
  if (nameNorm === "amex pesos") {
    return { kind: "CREDIT_CARD", creditLimit: 7_228_000 };
  }
  if (nameNorm === "amex usd") {
    return { kind: "CREDIT_CARD", creditLimit: null };
  }
  if (nameNorm === "rappi mc") {
    return { kind: "CREDIT_CARD", creditLimit: 20_000_000 };
  }
  if (nameNorm === "nu bank") {
    return { kind: "CREDIT_CARD", creditLimit: 11_000_000 };
  }
  if (nameNorm === "davivienda") {
    // Row 20 is regular Davivienda (credit card)
    return { kind: "CREDIT_CARD", creditLimit: 15_000_000 };
  }
  if (nameNorm === "davivienda (credito)") {
    // Row 26 is Davivienda credito (loan)
    return { kind: "LOAN", creditLimit: null };
  }
  if (nameNorm === "b occ mc" || nameNorm === "b occ mc usd") {
    return { kind: "CREDIT_CARD", creditLimit: null };
  }
  if (nameNorm === "b occ vs") {
    return { kind: "CREDIT_CARD", creditLimit: null };
  }

  // Loans
  if (
    nameNorm === "aparatamiento" ||
    nameNorm === "apto" ||
    nameNorm === "credito de carro" ||
    nameNorm === "cuota credito banco"
  ) {
    return { kind: "LOAN", creditLimit: null };
  }
  if (nameNorm.includes("davivienda") && nameNorm.includes("credito")) {
    return { kind: "LOAN", creditLimit: null };
  }

  // Personal
  if (
    nameNorm === "hoyadelantas" ||
    nameNorm === "nicolas prestamos" ||
    nameNorm === "nicolas deuda" ||
    nameNorm === "paseos mama"
  ) {
    return { kind: "PERSONAL", creditLimit: null };
  }

  // Tax
  if (
    nameNorm === "impuestos" ||
    nameNorm === "declaracion de renta"
  ) {
    return { kind: "TAX", creditLimit: null };
  }

  // Default to OTHER
  return { kind: "OTHER", creditLimit: null };
}

// Parse note blocks for a given month (rows 35-91)
/**
 * Untitled blocks whose lines mostly start with the same word
 * (e.g. "Impuestos May 2026", "Impuestos Junio 2026") take that word as title.
 */
function sharedPrefixTitle(items: DebtNoteItemData[]): string | null {
  if (items.length < 2) return null;
  const counts = new Map<string, number>();
  for (const it of items) {
    const word = it.label.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    if (word.length < 4) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  let best: [string, number] | null = null;
  for (const entry of counts) {
    if (!best || entry[1] > best[1]) best = entry;
  }
  if (!best || best[1] < 2 || best[1] * 2 < items.length) return null;
  return best[0].charAt(0).toUpperCase() + best[0].slice(1);
}

function parseNoteBlocks(
  sheet: XLSX.WorkSheet,
  colIndex: number
): DebtNoteGroupData[] {
  const firstColLetter = XLSX.utils.encode_col(colIndex);
  const secondColLetter = XLSX.utils.encode_col(colIndex + 1);

  const blocks: DebtNoteGroupData[] = [];
  let currentBlock: {
    items: DebtNoteItemData[];
    title: string | null;
  } | null = null;
  let blockSortOrder = 0;
  let hasExplicitTitle = false;

  for (let rowIndex = 35; rowIndex <= 91; rowIndex++) {
    const labelCell = sheet[`${firstColLetter}${rowIndex}`];
    const valueCell = sheet[`${secondColLetter}${rowIndex}`];

    const label =
      labelCell && typeof labelCell.v === "string"
        ? labelCell.v.trim()
        : null;
    const value =
      valueCell && typeof valueCell.v === "number" ? valueCell.v : null;

    // Empty row: not a string label AND not a number value
    const isEmpty = label === null && value === null;

    if (isEmpty) {
      // End current block
      if (currentBlock && currentBlock.items.length > 0) {
        // Determine final title
        let finalTitle = currentBlock.title;
        if (!finalTitle) {
          if (currentBlock.items.length === 1) {
            // Single item: use its label
            finalTitle = currentBlock.items[0].label;
          } else {
            // Multi-item untitled block: "Notas", "Notas 2", "Notas 3", etc.
            const shared = sharedPrefixTitle(currentBlock.items);
            const untitledCount = blocks.filter(
              (b) => b.title.startsWith("Notas")
            ).length;
            finalTitle =
              shared ??
              (untitledCount === 0 ? "Notas" : `Notas ${untitledCount + 1}`);
          }
        }

        blocks.push({
          title: finalTitle,
          items: currentBlock.items,
          sortOrder: blockSortOrder,
        });
        blockSortOrder++;
      }
      currentBlock = null;
      hasExplicitTitle = false;
      continue;
    }

    // Skip if label is not a string (date/number in label column is a separator)
    if (label === null) {
      // End current block
      if (currentBlock && currentBlock.items.length > 0) {
        let finalTitle = currentBlock.title;
        if (!finalTitle) {
          if (currentBlock.items.length === 1) {
            finalTitle = currentBlock.items[0].label;
          } else {
            const shared = sharedPrefixTitle(currentBlock.items);
            const untitledCount = blocks.filter(
              (b) => b.title.startsWith("Notas")
            ).length;
            finalTitle =
              shared ??
              (untitledCount === 0 ? "Notas" : `Notas ${untitledCount + 1}`);
          }
        }
        blocks.push({
          title: finalTitle,
          items: currentBlock.items,
          sortOrder: blockSortOrder,
        });
        blockSortOrder++;
      }
      currentBlock = null;
      hasExplicitTitle = false;
      continue;
    }

    // Skip rows matching /^\s*(sub-?\s*)?total/i
    if (/^\s*(sub-?\s*)?total/i.test(label)) {
      continue;
    }

    // Start new block if needed
    if (!currentBlock) {
      currentBlock = { items: [], title: null };
      hasExplicitTitle = false;
    }

    // Row with label but no value: potential title (only if block has no items yet)
    if (value === null) {
      if (currentBlock.items.length === 0 && !hasExplicitTitle) {
        currentBlock.title = label;
        hasExplicitTitle = true;
      }
      // Otherwise ignore label-without-number rows in the middle of a block
      continue;
    }

    // Skip values with Math.abs(value) < 1 (ratios)
    if (Math.abs(value) < 1) {
      continue;
    }

    // Amount conversion: if value < 1_000_000 multiply by 1000; else keep as is
    const amount =
      Math.abs(value) < 1_000_000
        ? Math.round(value * 1000)
        : Math.round(value);

    // Add item
    currentBlock.items.push({
      label,
      amount,
      sortOrder: currentBlock.items.length,
    });
  }

  // Handle last block if it exists
  if (currentBlock && currentBlock.items.length > 0) {
    let finalTitle = currentBlock.title;
    if (!finalTitle) {
      if (currentBlock.items.length === 1) {
        finalTitle = currentBlock.items[0].label;
      } else {
        const shared = sharedPrefixTitle(currentBlock.items);
        const untitledCount = blocks.filter(
          (b) => b.title.startsWith("Notas")
        ).length;
        finalTitle =
          shared ??
          (untitledCount === 0 ? "Notas" : `Notas ${untitledCount + 1}`);
      }
    }
    blocks.push({
      title: finalTitle,
      items: currentBlock.items,
      sortOrder: blockSortOrder,
    });
  }

  return blocks;
}

async function main() {
  try {
    // Parse CLI arguments
    const args = process.argv.slice(2);
    let filePath = "../Deudas Ruben 2026.xlsx";
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
    const sheet = workbook.Sheets["Balance"];
    if (!sheet) {
      console.error("Error: Sheet 'Balance' not found in workbook");
      process.exit(1);
    }

    // Get TRM from D1 (in thousands COP per USD)
    const trmCell = sheet["D1"];
    const trmThousands = trmCell?.v ?? 4.17;
    const trm = typeof trmThousands === "number" ? trmThousands * 1000 : 4170;

    console.log(`TRM: ${trm} COP/USD (from ${trmThousands}k)`);

    // Find all month headers starting from column B (column 2)
    // Each month occupies two columns: [Saldo, Pagos]
    const monthColumns: Array<{
      colIndex: number;
      colLetter: string;
      month: ParsedMonth;
    }> = [];

    let colIndex = 1; // B (XLSX.utils.encode_col is 0-based: A = 0)
    let lastHeaderCol = 0;

    while (true) {
      const colLetter = XLSX.utils.encode_col(colIndex);
      const headerCell = sheet[`${colLetter}3`];

      if (!headerCell || !headerCell.v) {
        // Stop if no header in this column and next 2 columns are also empty
        if (colIndex - lastHeaderCol > 2) {
          break;
        }
        colIndex += 2;
        continue;
      }

      const parsed = parseMonthHeader(headerCell.v);
      if (parsed) {
        monthColumns.push({ colIndex, colLetter, month: parsed });
        lastHeaderCol = colIndex;
      }

      colIndex += 2;
    }

    if (monthColumns.length === 0) {
      console.error("Error: No month headers found");
      process.exit(1);
    }

    console.log(`Found ${monthColumns.length} months: ${
      monthColumns
        .map((m) => `${m.month.month}/${m.month.year}`)
        .join(", ")
    }`);

    // Parse debt rows (5-26)
    const debts = new Map<string, DebtRow>();
    const debtNameCount = new Map<string, number>();

    for (let rowIndex = 5; rowIndex <= 26; rowIndex++) {
      const nameCell = sheet[`A${rowIndex}`];
      if (!nameCell || !nameCell.v) {
        continue;
      }

      let name = String(nameCell.v).trim();

      // Skip if name is empty
      if (!name) {
        continue;
      }

      // Label-only rows: "TC" is a section header for the credit cards and
      // "Cuota Credito Banco" only carries side notes. The Excel's DEUDA TOTAL
      // (=SUM of rows 14..26) never includes them, so they are not debts.
      if (LABEL_ROWS.has(name.toLowerCase())) {
        continue;
      }

      // Handle duplicate names: Davivienda appears twice (row 20 as CC, row 26 as loan)
      const normalizedName = name.toLowerCase();
      if (normalizedName === "davivienda") {
        const count = (debtNameCount.get("davivienda") ?? 0) + 1;
        debtNameCount.set("davivienda", count);
        if (count === 2) {
          name = "Davivienda (credito)";
        }
      }

      const entries = new Map<string, { balance: number; payment: number }>();

      // Parse month pairs for this debt
      for (const { colIndex, month } of monthColumns) {
        const balanceColLetter = XLSX.utils.encode_col(colIndex);
        const paymentColLetter = XLSX.utils.encode_col(colIndex + 1);

        const balanceCell = sheet[`${balanceColLetter}${rowIndex}`];
        const paymentCell = sheet[`${paymentColLetter}${rowIndex}`];

        const balance =
          typeof balanceCell?.v === "number" ? balanceCell.v * 1000 : 0;
        const payment =
          typeof paymentCell?.v === "number" ? paymentCell.v * 1000 : 0;

        if (balance !== 0 || payment !== 0) {
          const key = `${month.year}-${String(month.month).padStart(2, "0")}`;
          entries.set(key, { balance, payment });
        }
      }

      // Skip if no numeric data
      if (entries.size === 0) {
        continue;
      }

      debts.set(name, {
        name,
        entries,
        sortOrder: rowIndex - 5,
      });
    }

    console.log(`Parsed ${debts.size} debts`);

    // Parse salary and extra income (rows 28-29)
    const monthDataMap = new Map<string, MonthData>();

    for (const { colIndex, month } of monthColumns) {
      const salaryColLetter = XLSX.utils.encode_col(colIndex);
      // Row 28 = "Sueldo". In the sheet the salary sometimes sits in the
      // second column of the month pair (2026 columns, where the first column
      // holds a derived formula), sometimes in the first one (2022-2024), and
      // from mid-2024 to late-2025 row 28 is empty and the income was typed in
      // row 30 ("Ingresos", first column only; its second column holds ratios).
      const secondColLetter = XLSX.utils.encode_col(colIndex + 1);
      const salaryCandidates: unknown[] = [
        sheet[`${secondColLetter}28`]?.v,
        sheet[`${salaryColLetter}28`]?.v,
        sheet[`${salaryColLetter}30`]?.v,
      ];
      const salaryThousands = salaryCandidates.find(
        (v): v is number => typeof v === "number" && v > 0
      );
      const salary = salaryThousands !== undefined ? salaryThousands * 1000 : 0;

      // Row 29 = occasional extra income (sales, commissions). Check both
      // columns of the pair; negative values are derived "diferencia"
      // formulas, not income, so they are ignored.
      const extraCandidates: unknown[] = [
        sheet[`${salaryColLetter}29`]?.v,
        sheet[`${secondColLetter}29`]?.v,
      ];
      const extraThousands = extraCandidates.find(
        (v): v is number => typeof v === "number" && v > 0
      );
      const extraIncome = extraThousands !== undefined ? extraThousands * 1000 : 0;

      const key = `${month.year}-${String(month.month).padStart(2, "0")}`;
      monthDataMap.set(key, { year: month.year, month: month.month, salary, extraIncome });
    }

    // Parse note blocks for months >= 2025-12 (only import for these)
    const noteGroupsByMonth = new Map<
      string,
      DebtNoteGroupData[]
    >();

    for (const { colIndex, month } of monthColumns) {
      const monthKey = `${month.year}-${String(month.month).padStart(2, "0")}`;

      // Only import notes for months >= 2025-12
      if (month.year < 2025 || (month.year === 2025 && month.month < 12)) {
        continue;
      }

      const groups = parseNoteBlocks(sheet, colIndex);
      if (groups.length > 0) {
        noteGroupsByMonth.set(monthKey, groups);
      }
    }

    // Summary for dry-run
    const summary = {
      debtsToProcess: debts.size,
      monthsToProcess: monthDataMap.size,
      noteGroupsByMonth: noteGroupsByMonth.size,
      monthRange: monthColumns.length > 0
        ? `${monthColumns[0].month.month}/${monthColumns[0].month.year} - ${monthColumns[monthColumns.length - 1].month.month}/${monthColumns[monthColumns.length - 1].month.year}`
        : "N/A",
      trmValue: trm,
    };

    if (dryRun) {
      console.log("\n=== DRY RUN SUMMARY ===");
      console.log(JSON.stringify(summary, null, 2));

      console.log("\n=== DEBTS ===");
      for (const [name, debt] of debts) {
        const minMonth = Array.from(debt.entries.keys()).sort()[0];
        const maxMonth = Array.from(debt.entries.keys()).sort().at(-1);
        const totalBalance = Array.from(debt.entries.values()).reduce(
          (sum, e) => sum + e.balance,
          0
        );
        const totalPayment = Array.from(debt.entries.values()).reduce(
          (sum, e) => sum + e.payment,
          0
        );

        console.log(
          `${name}: ${debt.entries.size} months (${minMonth} - ${maxMonth}), balance sum: $${totalBalance.toLocaleString()}, payment sum: $${totalPayment.toLocaleString()}`
        );
      }

      console.log("\n=== MONTHS ===");
      for (const [key, data] of monthDataMap) {
        console.log(
          `${key}: salary $${data.salary.toLocaleString()}, extra $${data.extraIncome.toLocaleString()}`
        );
      }

      console.log("\n=== NOTE GROUPS ===");
      for (const [monthKey, groups] of noteGroupsByMonth) {
        console.log(`\n${monthKey}:`);
        for (const group of groups) {
          const groupTotal = group.items.reduce((sum, item) => sum + item.amount, 0);
          const groupTotalThousands = (groupTotal / 1000).toFixed(1);
          console.log(`  "${group.title}" (${group.items.length} items, ${groupTotalThousands}k):`);
          for (const item of group.items) {
            const itemThousands = (item.amount / 1000).toFixed(1);
            console.log(`    - ${item.label}: ${itemThousands}k`);
          }
        }
      }

      await prisma.$disconnect();
      return;
    }

    // Actual import: create/update debts, entries, and months
    console.log("\n=== IMPORTING ===");

    let debtsCreated = 0;
    let debtsUpdated = 0;
    let entriesUpserted = 0;
    let monthsUpserted = 0;
    let noteGroupsCreated = 0;
    let noteItemsCreated = 0;

    for (const [name, debt] of debts) {
      const metadata = getDebtMetadata(name);

      // Determine if active (has entries in 2026)
      const isActive = Array.from(debt.entries.keys()).some((key) =>
        key.startsWith("2026")
      );

      // Upsert debt
      const existing = await prisma.debt.findFirst({
        where: { userId: user.id, name },
      });

      if (existing) {
        await prisma.debt.update({
          where: { id: existing.id },
          data: {
            kind: metadata.kind,
            creditLimit: metadata.creditLimit,
            currency: "COP",
            isActive,
            sortOrder: debt.sortOrder,
          },
        });
        debtsUpdated++;
      } else {
        await prisma.debt.create({
          data: {
            userId: user.id,
            name,
            kind: metadata.kind,
            creditLimit: metadata.creditLimit,
            currency: "COP",
            isActive,
            sortOrder: debt.sortOrder,
          },
        });
        debtsCreated++;
      }

      // Get the debt ID
      const debtRecord = await prisma.debt.findFirst({
        where: { userId: user.id, name },
      });
      if (!debtRecord) {
        throw new Error(`Failed to find debt "${name}"`);
      }

      // Upsert entries
      for (const [key, { balance, payment }] of debt.entries) {
        const [yearStr, monthStr] = key.split("-");
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10);

        await prisma.debtEntry.upsert({
          where: {
            debtId_year_month: {
              debtId: debtRecord.id,
              year,
              month,
            },
          },
          create: {
            debtId: debtRecord.id,
            year,
            month,
            balance,
            payment,
          },
          update: {
            balance,
            payment,
          },
        });

        entriesUpserted++;
      }
    }

    // Upsert months
    for (const [, monthData] of monthDataMap) {
      await prisma.debtMonth.upsert({
        where: {
          userId_year_month: {
            userId: user.id,
            year: monthData.year,
            month: monthData.month,
          },
        },
        create: {
          userId: user.id,
          year: monthData.year,
          month: monthData.month,
          salary: monthData.salary,
          extraIncome: monthData.extraIncome,
          trm,
        },
        update: {
          salary: monthData.salary,
          extraIncome: monthData.extraIncome,
          trm,
        },
      });

      monthsUpserted++;
    }

    // Import note groups (only for months >= 2025-12)
    for (const [monthKey, groups] of noteGroupsByMonth) {
      const [yearStr, monthStr] = monthKey.split("-");
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);

      // Check if this month already has note groups
      const existingGroupCount = await prisma.debtNoteGroup.count({
        where: {
          userId: user.id,
          year,
          month,
        },
      });

      if (existingGroupCount > 0) {
        console.log(
          `Skipping notes for ${monthKey} (already has ${existingGroupCount} groups)`
        );
        continue;
      }

      // Create note groups with their items
      for (const group of groups) {
        await prisma.debtNoteGroup.create({
          data: {
            userId: user.id,
            year,
            month,
            title: group.title,
            sortOrder: group.sortOrder,
            items: {
              create: group.items.map((item) => ({
                label: item.label,
                amount: item.amount,
                sortOrder: item.sortOrder,
              })),
            },
          },
        });

        noteGroupsCreated++;
        noteItemsCreated += group.items.length;
      }
    }

    console.log(`\n=== IMPORT COMPLETE ===`);
    console.log(`Debts created: ${debtsCreated}`);
    console.log(`Debts updated: ${debtsUpdated}`);
    console.log(`Entries upserted: ${entriesUpserted}`);
    console.log(`Months upserted: ${monthsUpserted}`);
    console.log(`Note groups created: ${noteGroupsCreated}`);
    console.log(`Note items created: ${noteItemsCreated}`);
    console.log(`Month range: ${summary.monthRange}`);

    await prisma.$disconnect();
  } catch (error) {
    console.error("Error during import:", error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
