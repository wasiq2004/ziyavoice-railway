import { Tool, ToolParameter, ToolType, PreActionPhraseMode } from '../types';
import { getApiBaseUrl, getApiPath } from '../utils/api';

export class GoogleSheetsService {
  private spreadsheetId: string;

  constructor(spreadsheetId: string) {
    this.spreadsheetId = spreadsheetId;
  }

  static extractSpreadsheetIdFromUrl(url: string): string {
    // Match patterns like:
    // https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit
    // https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      throw new Error('Invalid Google Sheets URL');
    }
    return match[1];
  }
  async appendDataToSheet(data: Record<string, any>, sheetName?: string): Promise<boolean> {
    try {
      // Call the backend API to append data to Google Sheets
      const response = await fetch(`${getApiBaseUrl()}${getApiPath()}/tools/google-sheets/append`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          spreadsheetId: this.spreadsheetId,
          data,
          sheetName
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Failed to append data to Google Sheets: ${response.statusText}`);
      }

      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error('Error appending data to Google Sheets:', error);
      return false;
    }
  }

  createSheetsTool(toolName: string, parameters: ToolParameter[], sheetUrl: string): Tool {
    return {
      id: `sheets-${Date.now()}`,
      name: toolName,
      description: `Collects user data and saves it to Google Sheets`,
      type: ToolType.GoogleSheets,
      webhookUrl: sheetUrl, // Store the Google Sheets URL here
      method: 'POST',
      runAfterCall: false,
      preActionPhrasesMode: PreActionPhraseMode.Flexible,
      preActionPhrases: [`Collecting ${toolName} information`],
      parameters: parameters,
      headers: [] // Not used for Google Sheets
    };
  }
  async executeSheetsTool(tool: Tool, collectedData: Record<string, any>): Promise<boolean> {
    try {
      // Validate that we have all required parameters
      if (tool.parameters) {
        for (const param of tool.parameters) {
          if (param.required && !(param.name in collectedData)) {
            throw new Error(`Required parameter '${param.name}' is missing`);
          }
        }
      }

      // Append data to Google Sheets
      const result = await this.appendDataToSheet(collectedData, tool.name);

      return result;
    } catch (error) {
      console.error('Error executing Google Sheets tool:', error);
      return false;
    }
  }
}

// Default export for the service
export default GoogleSheetsService;