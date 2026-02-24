import OpenAI from "openai";

interface Category {
  id: string;
  name: string;
  emoji: string;
}

interface ClassificationResult {
  categoryId: string;
  description: string;
}

// In-memory cache for merchant classifications
const classificationCache = new Map<string, ClassificationResult>();

function normalizeMerchant(merchant: string): string {
  return merchant.toLowerCase().trim();
}

export async function classifyExpense(
  merchant: string,
  categories: Category[]
): Promise<ClassificationResult> {
  const key = normalizeMerchant(merchant);

  // Check cache first
  const cached = classificationCache.get(key);
  if (cached) {
    // Verify the cached category still exists
    const stillExists = categories.find((c) => c.id === cached.categoryId);
    if (stillExists) return cached;
  }

  // Find "Otros" as fallback
  const otrosCategory = categories.find(
    (c) => c.name.toLowerCase() === "otros"
  );
  const fallback: ClassificationResult = {
    categoryId: otrosCategory?.id || categories[0]?.id || "",
    description: "Gasto general",
  };

  if (!process.env.OPENAI_API_KEY) {
    return fallback;
  }

  try {
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const categoryList = categories
      .map((c) => `- ID: "${c.id}" | Nombre: "${c.name}" ${c.emoji}`)
      .join("\n");

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 200,
      messages: [
        {
          role: "system",
          content: `Eres un clasificador de gastos para el mercado colombiano.
Dado el nombre de un comercio, debes:
1. Identificar que tipo de negocio es (entender contexto colombiano: Exito/Carulla/Jumbo = supermercado, Farmatodo/Drogueria = farmacia, Rappi/iFood = delivery comida, Uber/DiDi/InDriver = transporte, etc.)
2. Asignar la categoria mas apropiada de la lista
3. Escribir una descripcion breve (1-2 oraciones) sobre que es el comercio

CATEGORIAS DISPONIBLES:
${categoryList}

Responde SOLO con JSON valido: { "category_id": "ID_AQUI", "description": "Descripcion aqui" }`,
        },
        {
          role: "user",
          content: `Clasifica este comercio: "${merchant}"`,
        },
      ],
    });

    const text = response.choices[0]?.message?.content || "";

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return fallback;

    const parsed = JSON.parse(jsonMatch[0]);
    const result: ClassificationResult = {
      categoryId: parsed.category_id || fallback.categoryId,
      description: parsed.description || "Gasto general",
    };

    // Verify category exists
    const validCategory = categories.find((c) => c.id === result.categoryId);
    if (!validCategory) return fallback;

    // Cache the result
    classificationCache.set(key, result);

    return result;
  } catch (error) {
    console.error("AI classification error:", error);
    return fallback;
  }
}
