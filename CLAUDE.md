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

**Nota Prisma 7:** No usar `url` en datasource del schema. La URL se configura en `prisma.config.ts`. Los campos con `@map` se acceden por su nombre Prisma (ej: `createdBy` no `createdById`). Las relaciones requieren `connect` en vez de IDs directos en `create()`.

## Convenciones
- Todo el codigo en TypeScript estricto, sin `any`
- Validacion de inputs con Zod en todas las API routes
- Manejo de errores consistente: `{ error: string, details?: any }`
- Componentes en PascalCase, utilidades en camelCase
- Interfaz 100% en espanol
- Mobile-first responsive design
- Siempre usar `async/await`, nunca `.then()`

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
