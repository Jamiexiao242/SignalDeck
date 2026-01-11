#  SignalDeck: The AI-Powered Financial Intelligence Platform

<div align="center">

![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js)
![Groq](https://img.shields.io/badge/Powered%20By-Groq-orange?style=for-the-badge)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=for-the-badge&logo=typescript)

<a href="https://groq.com" target="_blank" rel="noopener noreferrer">
  <img
    src="https://console.groq.com/powered-by-groq-light.svg"
    alt="Powered by Groq for fast inference."
    width="160"
  />
</a>

**Next-Gen Market Analysis with LPU™ Inference Speed**

[Features](#-key-features) • [Architecture](#-technical-architecture) • [Research Mode](#-deep-research-mode) • [UI Components](#-interactive-financial-ui)

</div>

---

##  Overview

**SignalDeck** is a cutting-edge AI financial assistant re-engineered for the speed of thought. Built on **Next.js 14** and powered by **Groq's LPU™ (Language Processing Unit)** technology, it delivers sub-second market insights, real-time charting, and autonomous equity research.

Unlike traditional chatbots, SignalDeck integrates directly with live market data and professional visualization tools, transforming natural language queries into interactive financial dashboards.

##  Key Features

###  **Instantaneous AI Inference**
- **Powered by Groq**: Leverages the world's fastest AI inference engine to provide near-instant responses.
- **LLM Agnostic**: Optimized for open models like **Llama 3** and **Mixtral 8x7b** via Groq API.

###  **Deep Research Agent**
An autonomous agentic workflow that goes beyond simple chat:
- **Multi-Source Synthesis**: Aggregates data from news, corporate filings, and market sentiment.
- **Structured Reporting**: Generates professional-grade equity research reports complete with:
    - **Mermaid Flowcharts**: Visualizing cause-and-effect relationships in business logic.
    - **LaTeX Financial Math**: Rendering complex valuation formulas beautifully.
    - **Source Citations**: Fully referenced facts for reliability.

###  **Real-Time Market Data**
- **Live Web Search**: Integrates **SearXNG** or **Google Custom Search** to fetch up-to-the-minute news and events.
- **Fallback Mechanisms**: Robust error handling ensures you always get an answer, even if primary data sources are intermittent.

---

##  Interactive Financial UI

SignalDeck goes beyond text, utilizing **Generative UI** to render rich, interactive widgets directly in the chat stream.

| Component | Description |  
|-----------|-------------|
| **Advanced Stock Charts** | Full-featured TradingView charts with timeframes, indicators, and comparison supports. |
| **Financial Health** | Visual breakdown of Revenue, Earnings, and critical financial ratios. | 
| **Market Heatmaps** | Live visualization of sector performance and market breadth. | 
| **ETF & Sector Maps** | Track performance across different asset classes and industries. | 
| **Stock Screener** | Filter and discover stocks based on technical and fundamental criteria. | 
| **Trending Tickers** | Real-time list of top gainers, losers, and most active stocks. | 

---

##  Technical Architecture

### **Integrations**
- **AI Provider**: Groq Cloud API
- **Market Data**: TradingView Widgets
- **Search Engine**: SearXNG (Self-hosted or Public Instances) / Google CSE
- **Visualizations**: D3.js (`d3-scale`), Recharts

### **Generative UI Flow**
1. **Intent Recognition**: The LLM analyzes the user prompt (e.g., "Show me NVDA vs AMD").
2. **Tool Routing**: The system selects the appropriate UI component (`showStockChart`, `showStockFinancials`).
3. **Data Fetching**: Parallel execution of external API calls and search queries.
4. **Streamed Response**: React Server Components stream the interactive UI + text explanation to the client instantly.

---

##  Deep Research Mode

**"Act as a Senior Equity Analyst"**

Enable **Research Mode** to trigger a complex, multi-step analysis workflow:

1.  **Ticker Resolution**: Intelligently identifies company tickers from vague names.
2.  **Parallel Information Retrieval**: Concurrently searches for:
    - *Latest News*
    - *Earnings Reports*
    - *Valuation Metrics*
    - *Risk Factors*
3.  **Synthesis & Drafting**: The AI compiles thousands of words of context into a concise, actionable report.
4.  **Visual Output**: Delivers a structured markdown report with embedded charts and logic diagrams.

---


## Quickstart

Copy the example environment file:

```bash
cp .env.example .env.local
```

Add your API key to `.env.local`:

```
GROQ_API_KEY=your_key_here
```

Optional: use Google Custom Search (CSE) instead of SearxNG.

```
GOOGLEsearch_API_KEY=your_key_here
GOOGLEsearch_CX=your_cx_here
GOOGLESEARCH_FALLBACK_SEARX=false
```

Install dependencies and start the dev server:

```bash
pnpm install
pnpm dev
```

Visit [localhost:3000](http://localhost:3000/).

## Credits

- Based on `stockbot-on-groq` by Benjamin Klieger (Groq): https://github.com/bklieger-groq/stockbot-on-groq
- Built from the Vercel AI Chatbot template: https://github.com/vercel/ai-chatbot
- Modifications in this fork: added search, removed Groq branding, and ongoing feature additions
- Customized and maintained by jamie

## Notice

This project is a fork of StockBot Powered by Groq with added search context and enhanced Markdown rendering. It is intended for educational and informational use only.

## License

Apache 2.0. See `LICENSE`.

---


<div align="center">

</div>
