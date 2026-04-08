declare module "csv-parser" {
  import { Transform } from "node:stream";

  type CsvParserOptions = {
    headers?: string[] | boolean;
    separator?: string;
    quote?: string;
    escape?: string;
    newline?: string;
    strict?: boolean;
    maxRowBytes?: number;
    mapHeaders?: (args: { header: string; index: number }) => string | null;
    mapValues?: (args: { header: string; index: number; value: unknown }) => unknown;
  };

  export default function csvParser(options?: CsvParserOptions): Transform;
}
