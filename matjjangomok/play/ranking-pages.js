const serverPageSize = 30;
export const rankingPageTarget = 10;
export const rankingPageLimit = 20;

// Keep the server's ranking/tie order while showing a smaller, scroll-free page.
export class RankingPages {
  constructor(tab, request) {
    this.tab = tab;
    this.request = request;
    this.batches = new Map();
    this.total = null;
  }

  async batch(page) {
    if (!this.batches.has(page)) {
      const path = this.tab === "rating" ? "/rankings/rating?page=" + page
        : this.tab === "previous" ? "/tournament?view=previous" : "/tournament";
      const pending = Promise.resolve().then(() => this.request(path)).then(result => {
        if (result.error) this.batches.delete(page);
        return result;
      }, error => {
        this.batches.delete(page);
        throw error;
      });
      this.batches.set(page, pending);
    }
    return this.batches.get(page);
  }

  async page(number, size) {
    if (!Number.isInteger(number) || number < 1 || !Number.isInteger(size) || size < 1 || size > rankingPageLimit) {
      throw new TypeError("Rankings require a positive page and 1–20 entries per page");
    }
    const first = (number - 1) * size;
    const batchNumber = this.tab === "rating" ? Math.floor(first / serverPageSize) + 1 : 1;
    const result = await this.batch(batchNumber);
    if (result.error) return { ...result, page: number, pages: Math.max(1, Math.ceil((this.total ?? 0) / size)) };

    const rows = result.standings ?? [];
    this.total = this.tab === "rating" ? result.total : rows.length;
    const pages = Math.max(1, Math.ceil(this.total / size));
    if (number > pages) return this.page(pages, size);

    let entries = rows;
    let offset = first;
    if (this.tab === "rating") {
      offset = first % serverPageSize;
      if (offset + size > serverPageSize && result.hasMore) {
        const next = await this.batch(batchNumber + 1);
        if (next.error) return { ...next, page: number, pages };
        entries = [...rows, ...(next.standings ?? [])];
      }
    }
    return { ...result, standings: entries.slice(offset, offset + size), page: number,
      pages, pageSize: size, hasMore: number < pages };
  }
}
