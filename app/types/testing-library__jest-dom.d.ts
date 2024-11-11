declare module '@testing-library/jest-dom' {
  export interface Matchers<R = void, T = {}> {
    toBeInTheDocument(): R;
    toBeVisible(): R;
    toBeEmpty(): R;
    toBeEmptyDOMElement(): R;
    toBeInvalid(): R;
    toBeRequired(): R;
    toBeValid(): R;
    toBeDisabled(): R;
    toBeEnabled(): R;
    toBeChecked(): R;
    toBePartiallyChecked(): R;
    toHaveAccessibleDescription(description?: string | RegExp): R;
    toHaveAccessibleName(name?: string | RegExp): R;
    toHaveAttribute(attr: string, value?: any): R;
    toHaveClass(...classNames: string[]): R;
    toHaveFocus(): R;
    toHaveFormValues(values: { [key: string]: any }): R;
    toHaveStyle(css: string | { [key: string]: any }): R;
    toHaveTextContent(text: string | RegExp, options?: { normalizeWhitespace: boolean }): R;
    toHaveValue(value?: string | string[] | number): R;
    toBeInTheDOM(): R;
    toContainElement(element: HTMLElement | null): R;
    toContainHTML(htmlText: string): R;
    toHaveDescription(text?: string | RegExp): R;
    toHaveDisplayValue(value: string | RegExp | (string | RegExp)[]): R;
    toBeEmpty(): R;
    toBeInvalid(): R;
    toBeRequired(): R;
    toBeValid(): R;
    toBeVisible(): R;
    toHaveAttribute(attr: string, value?: any): R;
    toHaveClass(...classNames: string[]): R;
    toHaveFocus(): R;
    toHaveStyle(css: string | { [key: string]: any }): R;
    toHaveTextContent(text: string | RegExp, options?: { normalizeWhitespace: boolean }): R;
    toHaveValue(value?: string | string[] | number): R;
    toBeInTheDOM(): R;
    toContainElement(element: HTMLElement | null): R;
    toContainHTML(htmlText: string): R;
  }
}

declare global {
  namespace jest {
    interface Matchers<R> {
      toHaveAttribute(attr: string, value?: any): R;
      toHaveFocus(): R;
    }
  }
}
