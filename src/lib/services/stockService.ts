import { z } from 'zod';

// Define types for stock data
export interface StockData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockChartData {
  symbol: string;
  data: StockData[];
  metadata: {
    currency: string;
    exchange: string;
    timezone: string;
  };
}

// Schema for validating stock data
const stockDataSchema = z.object({
  date: z.string(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
});

export class StockService {
  private static instance: StockService;
  private apiKey: string;

  private constructor() {
    // You can use environment variables or config
    this.apiKey = process.env.ALPHA_VANTAGE_API_KEY || '';
  }

  public static getInstance(): StockService {
    if (!StockService.instance) {
      StockService.instance = new StockService();
    }
    return StockService.instance;
  }

  async fetchStockData(symbol: string, interval: '1min' | '5min' | '15min' | '30min' | '60min' = '1min'): Promise<StockChartData> {
    try {
      // Using Alpha Vantage API as an example
      const response = await fetch(
        `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${symbol}&interval=${interval}&apikey=${this.apiKey}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch stock data');
      }

      const data = await response.json();
      
      // Transform the data into our format
      const timeSeriesKey = `Time Series (${interval})`;
      const stockData: StockData[] = Object.entries(data[timeSeriesKey]).map(([date, values]: [string, any]) => ({
        date,
        open: parseFloat(values['1. open']),
        high: parseFloat(values['2. high']),
        low: parseFloat(values['3. low']),
        close: parseFloat(values['4. close']),
        volume: parseInt(values['5. volume']),
      }));

      return {
        symbol,
        data: stockData,
        metadata: {
          currency: 'USD',
          exchange: 'NYSE',
          timezone: 'America/New_York',
        },
      };
    } catch (error) {
      console.error('Error fetching stock data:', error);
      throw error;
    }
  }

  // Helper method to validate stock data
  validateStockData(data: StockData): boolean {
    try {
      stockDataSchema.parse(data);
      return true;
    } catch {
      return false;
    }
  }
} 