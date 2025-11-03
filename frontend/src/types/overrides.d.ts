declare module "clsx" {
  type ClassValue = string | number | null | boolean | undefined | ClassDictionary | ClassArray;
  interface ClassDictionary {
    [id: string]: unknown;
  }
  interface ClassArray extends Array<ClassValue> {}
  export default function clsx(...classes: ClassValue[]): string;
}

declare module "react/jsx-runtime" {
  export const Fragment: any;
  export const jsx: any;
  export const jsxs: any;
}
