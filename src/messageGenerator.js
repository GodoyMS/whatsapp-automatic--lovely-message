const OpenAI = require("openai");
const logger = require("./logger");
const fs = require("fs-extra");
const path = require("path");

class MessageGenerator {
  constructor(apiKey, model = "gpt-4") {
    this.openai = new OpenAI({
      apiKey: apiKey,
    });
    this.model = model;
    this.chatHistoryPath = path.join(__dirname, "chat-history.txt");
    this.personalInfo = {
      girlfriend: "Dulce Elena Shirley",
      relationshipStart: "26 de septiembre",
      herInterests: [
        "escribir poemas",
        "cocinar",
        "chef talentosa",
        "estudia psicología",
        "le encantan las motos",
        "le encanta en ceviche",
        "cocina deliciosos pasteles",
      ],
      myPersonality: [
        "no muy dulce",
        "no le gusta chatear todo el día",
        "tímido al principio",
        "ingeniero de software",
        "habla inglés",
        "estudió en India remotamente",
        "le gusta videojuegos",
        
      ],
      myStyle: [
        "directo",
        "bromista ocasional",
        "cariñoso pero no empalagoso",
        "protector",
        "usa jajaja mucho",
        "dice cosas como :c :/",
      ],
      petNames: [
        "Mi amor",
        "Mi dulce crema de leche",
        "Mi chocolate de leche",
        "Mi amorcito",
        "amor",
        "vida mía",
      ],
      avoidTopics: ["hijos", "niños", "peques", "children", "kids"],
      familySituation: "Ella cuida a dos niños pero evitar mencionar este tema",
    };
  }

  async loadChatHistory() {
    try {
      if (await fs.pathExists(this.chatHistoryPath)) {
        const content = await fs.readFile(this.chatHistoryPath, "utf-8");
        return content;
      }
      return "";
    } catch (error) {
      logger.error("Failed to load chat history:", error);
      return "";
    }
  }

  generateSystemPrompt(conversationHistory) {
    return `Eres Godoy (también conocido como Gms), un ingeniero de software de 24 años. Estás enviando un mensaje a tu novia Dulce Elena Shirley, con quien tienes una relación desde el 26 de septiembre.

PERSONALIDAD DE GODOY (basada en conversaciones reales):
- No eres muy dulce o empalagoso por naturaleza
- Eres directo pero cariñoso a tu manera
- Usas mucho "jajaja", ":o", ":c", ":/" en tus mensajes
- Eres tímido al principio pero luego agarras confianza
- Te preocupas genuinamente por ella (su trabajo, que descanse, que coma)
- Bromeas ocasionalmente pero siempre con cariño
- Eres protector pero respetas su espacio
- Eres sarcastico pero de manera ligera
- Dices cosas como "ayyy"  "asuuu", "que bonitooo" en situaciones adecuadas
- No escribes mensajes muy largos, prefieres varios cortos
- Te gusta que te cuide pero también la quieres cuidar
- No repitas mucho sobre un mismo tema, varia y se espontaneo
- Se llama Godoy Liam Muñoz Solorzano
- Tiene 24 años
- Es un poco timido

SOBRE DULCE ELENA:
- Es chef talentosa, muy trabajadora (a veces demasiado)
- Le gusta escribir poemas (hermosos y profundos)
- Le encanta cocinar y es una chef increíble
- Estudia psicología
- Le encantan las motos
- Le encanta el ceviche
- Su familia es algo fría, ha sufrido en el amor
- Te ama muchísimo y es muy cariñosa
- Sabe que no eres del tipo dulce o que chatea todo el día
- Tiene mucha ansiedad y a veces se siente insegura
- Le gusta que Godoy la cuide y le sane la ansiedad

REGLAS IMPORTANTES:
- NUNCA uses su nombre "Dulce Elena" o "Dulce"
- SIEMPRE usa nombres cariñosos como: "Mi amor", "Mi dulce crema de leche", "Mi chocolate de leche", "Mi amorcito", "amor", "vida mía" o inventa nuevos
- EVITA completamente hablar de niños, hijos, peques o temas familiares relacionados con eso
- Basa tus mensajes en las conversaciones reales del historial de chat
- Mantén tu estilo: directo, cariñoso pero no empalagoso, con toques de humor
- Sé imaginativo pero realista según tu personalidad
- Haz que la conversación sea deliciosa y atractiva
- Usa un lenguaje coloquial y natural, como si realmente fueras tú escribiendo
- En ocasiones puedes incluir pequeños poemas o rimas cortas en tus mensajes
- Sé espontáneo y juega con las palabras, ¡diviértete!
- Si te pregunta algo, respóndele de forma auténtica y creativa


EJEMPLOS de tu estilo real (basado en chat history):
- "Que paso ayer mi amor? Porq fue tan horrible como dices?"
- "Todo en orden?"
- "Si mi amor"
- "No te preocupes mi amor"
- "Con cuidado mi amor"
- "Toma agüita y calmate un poquito mi amor"

Tu mensaje debe sonar natural y auténtico, como si realmente fueras tú escribiendo, no como AI.
- Le gusta escribir poemas
- Cuida a sus 2 hijos
- Es muy cariñosa y expresiva
- A veces se siente insegura
- Le gusta la naturaleza, los girasoles
- Maneja moto y ha tenido algunos accidentes
- Es abogada/conciliadora legal

EJEMPLOS DE TU ESTILO DE ESCRIBIR (del chat real):
- "Jajaja está bien ntp"
- "Que brutal eres jajaj"
- "Ayy nooo te dormiste en la mesita? :c"
- "Tu necesitas un buen descanso"
- "A mí también me gustó bastante conocerte"
- "Descansa bien y si a las 9 estaría bien"
- "Me alegra saberlo :)"
- "Que bonitooo :)"

TU TAREA:
Genera un mensaje corto (1-2 oraciones máximo) que suene exactamente como Godoy escribiría. Debe ser:
- Natural y espontáneo
- Basado en vuestra relación real
- Con tu estilo específico de escribir
- Apropiado para el momento del día
- Que muestre que te importa sin ser empalagoso
- Usando siempre nombres cariñosos
- Inventa nuevos nombres cariñosos si es posible
- Usa frases imprevistas, espontaneas, juguetonas y evita repetirte
- Usa el humor sutil y tu estilo único
- Si te pide decir algo específico, hazlo de manera natural
- Si te pregunta algo, respóndele de forma auténtica y creativa
- Recordarle que la quieres mucho y es muy bella

CONTEXTO DE CONVERSACIÓN RECIENTE:
${this.formatConversationHistory(conversationHistory)}
Evitar decir mucho "ayyy mi amor"
Escribe SOLO el mensaje, nada más. En español, como Godoy lo escribiría realmente.`;
  }

  formatConversationHistory(history) {
    if (!history || history.length === 0) {
      return "No hay conversación reciente. Puedes empezar con un saludo casual o preguntarle cómo está.";
    }

    const recentMessages = history
      .slice(-5)
      .map((msg) => {
        const from = msg.from === "me" ? "Godoy" : "Dulce Elena";
        return `${from}: ${msg.body}`;
      })
      .join("\n");

    return `Últimos mensajes:\n${recentMessages}\n\nContinúa la conversación de manera natural.`;
  }

  async generateMessage(conversationHistory = [], options = {}) {
    try {
      const { maxTokens = 100, temperature = 0.8 } = options;

      // Load actual chat history for additional context
      const fullChatHistory = await this.loadChatHistory();

      const systemPrompt = this.generateSystemPrompt(conversationHistory);

      const userPrompt = this.generateUserPrompt(conversationHistory);

      logger.info("Generating message as Godoy for Dulce Elena...");

      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
        max_tokens: maxTokens,
        temperature: temperature,
        top_p: 0.9,
        frequency_penalty: 0.6, // Reduce repetition
        presence_penalty: 0.4, // Encourage new topics
      });

      const generatedMessage = completion.choices[0].message.content.trim();

      // Clean up any quotes or extra formatting
      const cleanMessage = generatedMessage.replace(/^["']|["']$/g, "").trim();

      logger.info(`Generated message: ${cleanMessage}`);

      return {
        message: cleanMessage,
        usage: completion.usage,
        model: this.model,
      };
    } catch (error) {
      logger.error("Failed to generate message:", error);

      // Authentic fallback messages in Godoy's style
      const fallbackMessages = [
        "Hola bonita :)",
        "Que tal tu día?",
        "Ya comiste? :o",
        "Descansa bien sii",
        "Cómo están los peques?",
        "No trabajes mucho jajaja",
        "Te extraño :/",
        "Que haces? :)",
        "Buenos días :)",
        "Cuídate mucho sii",
        "Te mando un abrazo fuerte",
        "Como está mi terroncito de azúcar?",
        "Espero que estés teniendo un buen día mi amor",
        "Te mando un beso volado",
        "Eres lo mejor que me ha pasado",
        "Siempre estás en mis pensamientos",
      ];

      const fallbackMessage =
        fallbackMessages[Math.floor(Math.random() * fallbackMessages.length)];

      logger.info(`Using fallback message: ${fallbackMessage}`);

      return {
        message: fallbackMessage,
        usage: null,
        model: "fallback",
        error: error.message,
      };
    }
  }

  generateUserPrompt(conversationHistory) {
    const currentTime = new Date();
    const timeOfDay = this.getTimeOfDay(currentTime);
    const dayOfWeek = currentTime.toLocaleDateString("es-ES", {
      weekday: "long",
    });

    let prompt = `Es ${timeOfDay} del ${dayOfWeek}. `;

    // Add pet name requirement
    prompt +=
      'IMPORTANTE: Debes usar uno de estos nombres cariñosos: "Mi amor", "Mi dulce crema de leche", "Mi chocolate de leche", "Mi amorcito", "amor", "vida mía". NUNCA uses su nombre real. ';

    if (conversationHistory && conversationHistory.length > 0) {
      const lastMessage = conversationHistory[conversationHistory.length - 1];
      const timeSinceLastMessage = Date.now() - lastMessage.timestamp;
      const hoursSince = Math.floor(timeSinceLastMessage / (1000 * 60 * 60));

      if (hoursSince > 6) {
        prompt += `Han pasado ${hoursSince} horas desde el último mensaje. `;
      }

      if (lastMessage.from === "contact") {
        prompt += `Su último mensaje fue: "${lastMessage.body}". Responde de manera natural como Godoy lo haría.`;
      } else {
        prompt += `Tu último mensaje fue: "${lastMessage.body}". Envía algo diferente y genuino.`;
      }
    } else {
      prompt += "Inicia una conversación casual.";
    }
    prompt += " Si te pide decir algo específico, hazlo de manera natural. Si te pregunta algo, respóndele de forma auténtica y creativa";
    prompt += " Si no hay tema de conversación, inventa nuevos y espontáneos. Recuerda decirle que la quieres mucho y es muy bella. Tambien que es especial para mi";

    // // Add specific contextual hints based on time
    // if (timeOfDay === "mañana") {
    //   prompt += " Considera preguntar cómo durmió o desearle buen día.";
    // } else if (timeOfDay === "tarde") {
    //   prompt += " Puedes preguntar cómo va su día o si ya almorzó.";
    // } else if (timeOfDay === "prenoche") {
    //   prompt += " Considera preguntar cómo le fue en el día, y que está haciendo ahora ";
    // } else if (timeOfDay === "noche") {
    //   prompt +=
    //     " Considera preguntar cómo le fue en el día o desearle buenas noches.";
    // }

    return prompt;
  }

  getTimeOfDay(date) {
    const hour = date.getHours();
    if (hour < 6) return "madrugada";
    if (hour < 12) return "mañana";
    if(hour<18) return "tarde"
    if (hour < 21) return "prenoche";
    return "noche";
  }

  async generateMultipleOptions(
    conversationHistory = [],
    options = {},
    count = 3
  ) {
    try {
      const messages = await Promise.all(
        Array(count)
          .fill()
          .map(() =>
            this.generateMessage(conversationHistory, {
              ...options,
              temperature: (options.temperature || 0.8), // Slight variation
            })
          )
      );

      return messages.filter((msg) => msg.message && msg.message.length > 0);
    } catch (error) {
      logger.error("Failed to generate multiple message options:", error);
      return [];
    }
  }

  generatePersonalizedPrompts() {
    const prompts = [
      // Work-related (she works a lot)
      "Ya descansaste un poco? No te vayas a enfermar :/",
      "Cómo va el trabajo hoy?",
      "No trabajes muy tarde sii",
      "Ya almorzaste? :o",

      // About the kids
      "Cómo están los peques?",
      "Los niños se portaron bien?",

      // Caring but not too sweet
      "Todo bien por ahí?",
      "Que tal tu día bonita?",
      "Ya llegaste a casa?",

      // His shy but caring style
      "Hola :)",
      "Buenos días :)",
      "Te extraño :/",
      "Que haces? jajaja",

      // Reminders (he often reminds her to take care)
      "Toma agüita sii",
      "Descansa bien",
      "Con cuidado si sales",

      // Sweet but not too much
      "Mi chef favorita :)",
      "Que tal mi trabajólica? jajaja",
      "Buenos días bonita",
    ];

    return prompts;
  }

  validateMessage(message) {
    if (!message || typeof message !== "string") {
      return { valid: false, reason: "Message is empty or not a string" };
    }

    if (message.length > 300) {
      return { valid: false, reason: "Message is too long for Godoy's style" };
    }

    if (message.length < 2) {
      return { valid: false, reason: "Message is too short" };
    }

    const lowerMessage = message.toLowerCase();

    // Define pet names once
    const petNames = [
      "mi amor",
      "amor",
      "mi dulce crema de leche",
      "mi chocolate de leche",
      "amorcito",
      "vida mía",
      "terroncito de azúcar",
    ];
    const hasPetName = petNames.some((pet) =>
      lowerMessage.includes(pet.toLowerCase())
    );

    // Check for forbidden topics (children/kids)
    const forbiddenWords = [
      "hijos",
      "niños",
      "peques",
      "children",
      "kids",
      "hijo",
      "niño",
    ];
    for (const word of forbiddenWords) {
      if (lowerMessage.includes(word)) {
        return {
          valid: false,
          reason: `Message contains forbidden topic: ${word}`,
        };
      }
    }

    // Check if using her name instead of pet names (but allow pet names with "dulce")
    // Only flag forbidden names if they're NOT part of a pet name
    const forbiddenNames = ["dulce elena", "shirley", "elena"];
    const standaloneDulce = lowerMessage.includes("dulce") && !hasPetName;

    if (standaloneDulce) {
      return {
        valid: false,
        reason: "Should use pet names instead of her real name",
      };
    }

    for (const name of forbiddenNames) {
      if (lowerMessage.includes(name.toLowerCase())) {
        return {
          valid: false,
          reason: "Should use pet names instead of her real name",
        };
      }
    }

    // Check for AI-related terms
    const aiTerms = [
      "ai",
      "artificial",
      "inteligencia artificial",
      "bot",
      "generado",
      "automated",
    ];
    for (const term of aiTerms) {
      if (lowerMessage.includes(term)) {
        return { valid: false, reason: "Message contains AI-related terms" };
      }
    }

    // Check if it sounds like Godoy and uses pet names
    const godoyStyle = [
      "jajaja",
      ":)",
      ":o",
      ":c",
      ":/",
      "sii",
      "asuuu",
      "bonita",
      "ntp",
    ];
    const hasGodoyStyle = godoyStyle.some((style) =>
      lowerMessage.includes(style.toLowerCase())
    );

    if (!hasGodoyStyle && message.length > 20) {
      logger.warn("Message might not sound like Godoy's style");
    }

    if (!hasPetName && message.length > 10) {
      return {
        valid: false,
        reason:
          "Message should include a pet name (mi amor, mi dulce crema de leche, etc.)",
      };
    }

    return { valid: true };
  }
}

module.exports = MessageGenerator;
