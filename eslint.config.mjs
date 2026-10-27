import js from "@eslint/js";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";

export default defineConfig(
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/*.d.ts",
      "**/db/migrations/**",
      "load-tests/**",
      "infra/**",
      "k8s/**",
      "docs/**",
    ],
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-namespace": ["error", { allowDeclarations: true }],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "TSAsExpression[typeAnnotation.type='TSTypeQuery'][typeAnnotation.exprName.name='db']",
          message:
            "Don't cast to `typeof db`. Type the parameter as `Tx` from @/db instead.",
        },
      ],
    },
  },

  {
    files: [
      "**/*.config.ts",
      "**/*.config.mjs",
      "**/build.ts",
      "eslint.config.mjs",
    ],
    languageOptions: {
      parserOptions: {
        projectService: false,
      },
    },
  },

  {
    files: ["**/*.test.ts", "**/tests/**/*.ts"],
    languageOptions: {
      globals: {
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        vi: "readonly",
        beforeEach: "readonly",
        beforeAll: "readonly",
        afterEach: "readonly",
        afterAll: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
