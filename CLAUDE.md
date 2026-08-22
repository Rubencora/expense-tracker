# Expense Tracker App

## Descripcion
App web de registro de gastos personales con bot de Telegram, captura automatica desde Apple Pay (iOS Shortcuts), clasificacion automatica con IA, espacios compartidos y dashboard con graficas. Interfaz completamente en espanol. Orientada al mercado colombiano.

## Stack
- **Framework:** Next.js 16+ (App Router, TypeScript, Turbopack)
- **Estilos:** Tailwind CSS v4 + shadcn/ui
- **Base de datos:** PostgreSQL via Prisma 7 ORM (Neon serverless)
- **Auth:** JWT con access + refresh tokens
- **Bot:** Telegram con grammy
- **IA:** OpenAI API (gpt-4o-mini) para clasificacion de gastos
- **Graficas:** recharts
- **Exportacion:** xlsx (Excel)
- **Deploy:** Vercel

## Comandos
- `npm run dev` — servidor de desarrollo
- `npx prisma migrate dev` — aplicar migraciones
- `npx prisma generate` — regenerar cliente
- `npx prisma db seed` — ejecutar seed (usuario demo)
- `npx prisma studio` — UI para ver la base de datos
- `npm run build` — build de produccion
- `npm run lint` — linter
- `npx tsx scripts/screenshot.ts` — tomar screenshots de todas las paginas
- `npx tsx scripts/import-debts-xlsx.ts --file "../Deudas Ruben 2026.xlsx" --email <email> [--dry-run]` — importar el historico de deudas desde el Excel (idempotente)
- `npx tsx scripts/import-loans-xlsx.ts --file "../Estado Credito Apto Ruben Cordoba 2025.xlsx" --email <email> [--dry-run]` — importar los creditos (apto y carro) desde el Excel (idempotente)

## Screenshots (Puppeteer)
El proyecto incluye un script de Puppeteer para capturar screenshots automaticamente.

**Setup:** Puppeteer ya esta instalado como devDependency.

**Uso:**
```bash
# Asegurate de que el dev server este corriendo
npm run dev

# En otra terminal, tomar screenshots
npx tsx scripts/screenshot.ts
```

**Que hace:**
1. Captura paginas publicas (login, register)
2. Hace login con el usuario demo (demo@misgastos.app / demo1234)
3. Captura todas las paginas autenticadas (dashboard, gastos, categorias, espacios, configuracion)
4. Captura versiones mobile (390x844) de las paginas autenticadas
5. Guarda todo en `screenshots/` (gitignored)

**Configuracion:**
- `BASE_URL` env var para apuntar a otro host (default: http://localhost:3000)
- Editar `scripts/screenshot.ts` para agregar mas paginas o viewports

## Estructura del Proyecto
```
src/
  app/                    # Next.js App Router pages
    (auth)/               # Login, register (sin layout protegido)
    (app)/                # Paginas protegidas (dashboard, gastos, etc.)
    api/                  # API Routes
      auth/               # register, login, refresh
      expenses/           # CRUD + shortcut endpoint
      categories/         # CRUD
      spaces/             # CRUD + join + members
      telegram/           # Webhook del bot
      users/              # Profile, regenerate token
      budgets/            # CRUD presupuestos
      dashboard/          # Stats + analytics
  lib/
    prisma.ts             # Prisma client singleton (PrismaPg adapter)
    auth.ts               # JWT helpers (sign, verify, middleware)
    api-client.ts         # Frontend fetch wrapper con token refresh
    ai/
      classify.ts         # Clasificacion de gastos con OpenAI (gpt-4o-mini)
    currency.ts           # Parser COP/USD + conversion
    debts.ts              # Calculos puros del Balance de deudas (replica las formulas del Excel)
    loans.ts              # Amortizacion francesa (PMT/IPMT/PPMT) + saldo real por modo (SCHEDULE | PAYMENTS)
    telegram/
      bot.ts              # Bot de Telegram con grammy + OpenAI
  components/
    ui/                   # shadcn/ui components
    onboarding/           # Modal paso a paso
  generated/
    prisma/               # Prisma client generado
scripts/
  screenshot.ts           # Puppeteer screenshot automation
prisma/
  schema.prisma
  seed.ts
  prisma.config.ts
```

## Modelos de Datos (Prisma)
- **User:** id, email, name, password_hash, api_token, telegram_chat_id, default_currency, timezone, default_space_id, onboarding_completed, created_at
- **Category:** id, user_id, name, emoji, color, is_default, is_active, sort_order, created_at
- **Expense:** id, user_id, space_id, category_id, merchant, amount, currency, amount_usd, description_ai, source (web/telegram/shortcut), created_at
- **Space:** id, name, created_by, invite_code, created_at
- **SpaceMember:** id, space_id, user_id, role (owner/member), joined_at
- **Budget:** id, user_id, category_id, monthly_limit_usd, created_at
- **Debt:** id, user_id, name, kind (CREDIT_CARD/LOAN/PERSONAL/TAX/OTHER), currency, credit_limit, is_active, sort_order, notes
- **DebtEntry:** id, debt_id, year, month, balance (saldo), payment (pago) — unico por (debt_id, year, month); montos en la moneda de la deuda, unidades completas
- **DebtMonth:** id, user_id, year, month, salary (sueldo), extra_income, trm (COP por USD, opcional: se arrastra el ultimo valor explicito) — unico por (user_id, year, month)
- **DebtNoteGroup / DebtNoteItem:** bloques libres por mes ("Notas del mes": titulo + lineas label/amount, total calculado), como las notas debajo de cada columna del Excel
- **Loan:** id, user_id, name, principal, monthly_rate (0.011 = 1,1% mensual), term_months, start_year/start_month (periodo 1), tracking_mode (SCHEDULE | PAYMENTS), notes, is_active, sort_order
- **LoanPeriod:** id, loan_id, period (1..n), payment (pago real), extra_payment (abono extra a capital), balance_override (saldo real reportado), note — unico por (loan_id, period)

**Nota Prisma 7:** No usar `url` en datasource del schema. La URL se configura en `prisma.config.ts`. Los campos con `@map` se acceden por su nombre Prisma (ej: `createdBy` no `createdById`). Las relaciones requieren `connect` en vez de IDs directos en `create()`.

## Convenciones
- Todo el codigo en TypeScript estricto, sin `any`
- Validacion de inputs con Zod en todas las API routes
- Manejo de errores consistente: `{ error: string, details?: any }`
- Componentes en PascalCase, utilidades en camelCase
- Interfaz 100% en espanol
- Mobile-first responsive design
- Siempre usar `async/await`, nunca `.then()`

## Balance de Deudas (pagina /deudas)
Replica la hoja "Balance" del Excel historico: una fila por deuda y, por cada mes, dos columnas **Saldo | Pagos**.
- DEUDA TOTAL = suma de saldos del mes (deudas USD convertidas con la TRM del mes); PAGOS = suma de pagos
- Ingresos = Sueldo + Ingresos extra; Presupuesto/dia = Ingresos / dias del mes
- Ejecutado/dia = Deuda total / dias transcurridos (mes actual: dia de hoy; meses pasados: dias del mes); % ejecucion = Ejecutado/dia / Presupuesto/dia
- Diferencia = Ingresos - Deuda total; Consumo TC = suma saldos tarjetas con cupo / suma cupos
- La UI tiene toggle **Miles | USD**: en "Miles" se escribe y se muestra en miles de COP (4862 = $4.862.000), como en el Excel; en "USD" se muestra/escribe en dolares convertidos con la TRM del mes. En BD siempre se guardan unidades completas en la moneda de la deuda.
- Seccion "Notas del mes" (`src/components/debts/MonthNotes.tsx`, API `/api/debts/notes*`): grupos editables por mes con total automatico y "Copiar del mes anterior".

## Creditos (pagina /creditos)
Replica las hojas "Credito HoyTrabajas" y "Credito Carro" del Excel: tabla de amortizacion francesa + estado real.
- Cuota = PMT(i, n, P); Interes_k = -IPMT; Amortizacion_k = -PPMT; Saldo teorico_k = Saldo_{k-1} - Amortizacion_k; EA = (1+i)^12 - 1
- Modo **SCHEDULE** (carro): cada mes paga la cuota; el usuario registra abonos extra a capital y, si quiere, el saldo real reportado por el banco (override). Saldo real_k = override ?? (saldo_{k-1} - amortizacion_k - extra_k); la proyeccion sigue hacia el futuro.
- Modo **PAYMENTS** (apto, prestamo del empleador): el usuario registra el pago real de cada mes; saldo real = capital - Σ pagos. En el Excel los periodos 1-8 cuentan la amortizacion teorica como pago (el importador lo replica).
- Resumen: pagado hasta hoy (%), saldo real (%), meses restantes y mes de pago total proyectado, intereses (a la fecha, proyectados hasta el pago total y totales del plazo).

## Reglas de Moneda (IMPORTANTE)
- Formato colombiano: punto como separador de miles -> `$53.000` = 53000 COP
- Formato USD: punto como decimal -> `$53.50` = 53.50 USD
- Regla de deteccion: si despues del punto hay 3 digitos -> es COP (miles); si hay 1-2 digitos -> es USD (decimal)
- Moneda base para reportes: USD
- Tasa de conversion: API de exchangerate en tiempo real, fallback a env FALLBACK_EXCHANGE_RATE

## Diseno
- **Tema:** Dark fintech premium
- **Fondo:** Oscuro profundo (#0B0D12) con mesh gradients sutiles
- **Acento principal:** Esmeralda (#10B981) con variantes light/dark
- **Tipografia:** DM Sans (headings/body) + JetBrains Mono (numeros financieros)
- **Cards:** Glassmorphism con backdrop-blur y bordes rgba(255,255,255,0.06)
- **Animaciones:** fade-in al cargar, stagger en listas, hover con elevacion y glow
- **Sidebar:** Dark con indicadores esmeralda activos
- **Bottom nav (mobile):** Flotante con glass effect y rounded corners
- **Clases utilitarias custom:** glass-card, glass-card-hover, glow-brand, text-gradient, bg-mesh, font-numbers, stagger-children
- **Loading:** Skeletons oscuros, spinners con border-brand
- **Empty states:** Iconos grandes + mensajes amigables

## Categorias por Defecto
Alimentacion (rojo), Transporte (verde), Entretenimiento (teal), Compras (dorado), Salud (rojo), Servicios (azul), Educacion (purpura), Viajes (teal), Otros (marron)

## Credenciales Demo
- **Email:** demo@misgastos.app
- **Password:** demo1234
