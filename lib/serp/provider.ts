export interface SerpResult {
  url: string;
  title: string;
  snippet: string;
}

export interface SerpPage {
  results: SerpResult[];
  /** false quand la pagination est épuisée */
  hasMore: boolean;
}

/** Interface d'abstraction SERP — permet de switcher Serper ↔ SerpAPI sans toucher au reste. */
export interface SerpProvider {
  /** page commence à 1 */
  search(query: string, page: number): Promise<SerpPage>;
}
