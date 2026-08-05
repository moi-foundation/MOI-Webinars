// The Bookseller's stock. Free to browse — you only pay to read.
//
// Keeping the catalog public and the CONTENT paid is the honest shape of this: discovery should
// never cost money, otherwise the buyer can't decide what it wants.

export interface Book {
  id: string;
  title: string;
  author: string;
  year: number;
  topics: string[];
}

export const CATALOG: Book[] = [
  { id: "moby-dick", title: "Moby-Dick", author: "Herman Melville", year: 1851,
    topics: ["obsession", "sea", "fate"] },
  { id: "on-the-origin", title: "On the Origin of Species", author: "Charles Darwin", year: 1859,
    topics: ["evolution", "science", "nature"] },
  { id: "the-prince", title: "The Prince", author: "Niccolò Machiavelli", year: 1532,
    topics: ["power", "politics", "strategy"] },
  { id: "meditations", title: "Meditations", author: "Marcus Aurelius", year: 180,
    topics: ["stoicism", "philosophy", "discipline"] },
];

export const findBook = (id: string): Book | undefined =>
  CATALOG.find((b) => b.id.toLowerCase() === id.toLowerCase());
