//search result with extracted content
export interface SearchResult {
  title: string;
  url: string;
  snippet?: string;
  content?: string;
}

export interface FetchResult {
  url: string;
  content: string;
}

//bridge between search tool (service) and search webview (component)
class SearchBridgeService {
  private pendingSearchResolve: ((results: SearchResult[]) => void) | null = null;
  private pendingSearchReject: ((error: Error) => void) | null = null;
  private searchTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private searchListeners = new Set<(query: string) => void>();

  private pendingFetchResolve: ((results: FetchResult[]) => void) | null = null;
  private pendingFetchReject: ((error: Error) => void) | null = null;
  private fetchTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private fetchListeners = new Set<(urls: string[]) => void>();

  //start a search (called by search tool)
  search(query: string): Promise<SearchResult[]> {
    this.cancelSearch();
    return new Promise((resolve, reject) => {
      this.pendingSearchResolve = resolve;
      this.pendingSearchReject = reject;
      //notify webview component
      this.searchListeners.forEach(l => l(query));
      //timeout after 15s
      this.searchTimeoutId = setTimeout(() => {
        if (this.pendingSearchReject) {
          this.pendingSearchReject(new Error('Search timeout'));
          this.cleanupSearch();
        }
      }, 15000);
    });
  }

  //fetch specific pages (called by fetch tool)
  fetchPages(urls: string[]): Promise<FetchResult[]> {
    this.cancelFetch();
    return new Promise((resolve, reject) => {
      this.pendingFetchResolve = resolve;
      this.pendingFetchReject = reject;
      //notify webview component
      this.fetchListeners.forEach(l => l(urls));
      //timeout after 25s
      this.fetchTimeoutId = setTimeout(() => {
        if (this.pendingFetchReject) {
          this.pendingFetchReject(new Error('Fetch timeout'));
          this.cleanupFetch();
        }
      }, 25000);
    });
  }

  resolveSearch(results: SearchResult[]): void {
    if (this.pendingSearchResolve) {
      this.pendingSearchResolve(results);
      this.cleanupSearch();
    }
  }

  rejectSearch(error: Error): void {
    if (this.pendingSearchReject) {
      this.pendingSearchReject(error);
      this.cleanupSearch();
    }
  }

  resolveFetch(results: FetchResult[]): void {
    if (this.pendingFetchResolve) {
      this.pendingFetchResolve(results);
      this.cleanupFetch();
    }
  }

  rejectFetch(error: Error): void {
    if (this.pendingFetchReject) {
      this.pendingFetchReject(error);
      this.cleanupFetch();
    }
  }

  subscribeSearch(listener: (query: string) => void): () => void {
    this.searchListeners.add(listener);
    return () => this.searchListeners.delete(listener);
  }

  subscribeFetch(listener: (urls: string[]) => void): () => void {
    this.fetchListeners.add(listener);
    return () => this.fetchListeners.delete(listener);
  }

  private cancelSearch(): void {
    if (this.pendingSearchReject) {
      this.pendingSearchReject(new Error('Search cancelled'));
    }
    this.cleanupSearch();
  }

  private cancelFetch(): void {
    if (this.pendingFetchReject) {
      this.pendingFetchReject(new Error('Fetch cancelled'));
    }
    this.cleanupFetch();
  }

  private cleanupSearch(): void {
    this.pendingSearchResolve = null;
    this.pendingSearchReject = null;
    if (this.searchTimeoutId) {
      clearTimeout(this.searchTimeoutId);
      this.searchTimeoutId = null;
    }
  }

  private cleanupFetch(): void {
    this.pendingFetchResolve = null;
    this.pendingFetchReject = null;
    if (this.fetchTimeoutId) {
      clearTimeout(this.fetchTimeoutId);
      this.fetchTimeoutId = null;
    }
  }
}

export const SearchBridge = new SearchBridgeService();
