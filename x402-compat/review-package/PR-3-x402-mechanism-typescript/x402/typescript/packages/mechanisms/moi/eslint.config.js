import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import";
import jsdoc from "eslint-plugin-jsdoc";
import prettier from "eslint-plugin-prettier";
import sonarjs from "eslint-plugin-sonarjs";

export default [
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["**/*.test.ts", "test/**/*", "dist/**"],
    languageOptions: { parser: tsparser, parserOptions: { ecmaVersion: "latest", sourceType: "module" } },
    plugins: { "@typescript-eslint": tseslint, import: importPlugin, jsdoc, prettier, sonarjs },
    rules: {
      ...js.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      "prettier/prettier": "error",
      complexity: ["error", 50],
      "max-lines": ["error", { max: 2000 }],
      "sonarjs/cognitive-complexity": ["error", 50],
      "import/order": [
        "error",
        {
          alphabetize: { order: "asc" },
          "newlines-between": "never",
          groups: ["builtin", "external", "internal", ["parent", "sibling"], "index", "object", "type"],
        },
      ],
      "jsdoc/require-jsdoc": [
        "error",
        { require: { FunctionDeclaration: true, MethodDefinition: true, ClassDeclaration: true } },
      ],
      "jsdoc/require-param": "error",
      "jsdoc/require-returns": "error",
      "@typescript-eslint/member-ordering": "error",
    },
  },
  {
    files: ["**/*.test.ts", "test/**/*"],
    languageOptions: { parser: tsparser, parserOptions: { ecmaVersion: "latest", sourceType: "module" } },
    plugins: { "@typescript-eslint": tseslint, import: importPlugin, prettier },
    rules: {
      "prettier/prettier": "error",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/member-ordering": "off",
      "import/order": ["error", { alphabetize: { order: "asc" }, "newlines-between": "never" }],
    },
  },
];
