const OpenAI = require('openai');

// Lazy-initialize so server can start without OPENAI_API_KEY (required only when summarizing)
let _openai = null;
function getOpenAI() {
  if (_openai) return _openai;
  const key = process.env.OPENAI_API_KEY;
  if (!key || key.trim() === '') {
    throw new Error('OPENAI_API_KEY is not set. Add it to your .env file to use report summarization.');
  }
  _openai = new OpenAI({ apiKey: key });
  return _openai;
}

const summarizeIFTAReport = async (text, quarter, year) => {
  try {
    const openai = getOpenAI();
    const prompt = `You are an expert at analyzing IFTA (International Fuel Tax Agreement) reports for commercial transportation insurance brokers.

Analyze the following IFTA report and provide a comprehensive summary in JSON format. The report is for ${quarter} ${year}.

Extract and summarize:
1. Total miles traveled
2. Total fuel purchased
3. Total fuel consumed
4. Fuel tax owed/paid by jurisdiction
5. Any discrepancies or issues
6. Key dates and deadlines
7. Jurisdictions involved
8. Vehicle information (if available)
9. Any warnings or compliance issues

Format the response as JSON with the following structure:
{
  "totalMiles": number,
  "totalFuelPurchased": number,
  "totalFuelConsumed": number,
  "jurisdictions": [
    {
      "name": "string",
      "miles": number,
      "fuelTax": number,
      "status": "paid|owed|pending"
    }
  ],
  "keyDates": ["string"],
  "vehicles": ["string"],
  "issues": ["string"],
  "summary": "string (2-3 sentence overview)"
}

IFTA Report Text:
${text.substring(0, 15000)}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert IFTA report analyst. Always respond with valid JSON only, no additional text.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 2000
    });

    const content = response.choices[0].message.content.trim();
    
    // Try to extract JSON from response
    let jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    // Fallback if JSON parsing fails
    return {
      summary: content,
      totalMiles: null,
      totalFuelPurchased: null,
      totalFuelConsumed: null,
      jurisdictions: [],
      keyDates: [],
      vehicles: [],
      issues: []
    };
  } catch (error) {
    console.error('AI summarization error:', error);
    
    // Fallback summary
    return {
      summary: `IFTA report for ${quarter} ${year} has been processed. Please review the document for detailed information.`,
      totalMiles: null,
      totalFuelPurchased: null,
      totalFuelConsumed: null,
      jurisdictions: [],
      keyDates: [],
      vehicles: [],
      issues: ['AI summarization unavailable - manual review required']
    };
  }
};

const checkReportAge = (detectedDate) => {
  if (!detectedDate) return null;
  
  const reportDate = new Date(detectedDate);
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  
  return reportDate < sixMonthsAgo;
};

module.exports = { summarizeIFTAReport, checkReportAge };
