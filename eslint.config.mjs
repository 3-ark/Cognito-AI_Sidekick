import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginReactConfig from "eslint-plugin-react/configs/recommended.js";
import pluginReactJSXRuntime from "eslint-plugin-react/configs/jsx-runtime.js";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import unusedImports from "eslint-plugin-unused-imports";
import stylisticTs from '@stylistic/eslint-plugin-ts'; // <-- Import the new plugin

export default [
  // 1. Global ignores
  {
    ignores: [
      "dist/",
      "*.test.(ts|tsx|js|jsx)",
      "test/",
      "jest.config.js",
      "node_modules/"
    ]
  },

  // 2. Base JavaScript configuration
  pluginJs.configs.recommended,

  // 3. Base TypeScript configuration (includes parser and recommended rules)
  // Note: tseslint.configs.recommended implicitly includes tseslint.plugin
  ...tseslint.configs.recommended,

  // 4. TypeScript-specific overrides and settings
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["./config/**/*.js"],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      '@stylistic/ts': stylisticTs
    },
    languageOptions: {
      parser: tseslint.parser, // Explicitly set parser for this block
      parserOptions: {
        project: "./tsconfig.json"
      }
    },
    rules: {
      // Your specific TypeScript rule overrides
      "@typescript-eslint/comma-dangle": "off", // Keep your override
      "@typescript-eslint/no-use-before-define": "off",
      "@typescript-eslint/no-unused-vars": "off", 
      "@stylistic/ts/lines-between-class-members": ["error", "always", {
        "exceptAfterSingleLine": true// Disabled for unused-imports plugin
      }]
    } 
  },

  // 5. React configuration
  {
    // Apply settings globally or restrict to specific files if needed
    files: ["**/*.{js,jsx,ts,tsx}"], // Apply React settings to all relevant files
    ...pluginReactConfig, // Base recommended React rules
    settings: {
      react: {
        version: "detect"
      }
    },
    rules: {
      // Your specific React rule overrides
      "react/prop-types": "off",
      "react/jsx-filename-extension": "off",
      "react-hooks/exhaustive-deps": "off",
      "react/jsx-props-no-spreading": "off",
      "react/no-children-prop": "off",
      "react/require-default-props": ["error", { "ignoreFunctionalComponents": true }],
      "react/jsx-max-props-per-line": ["warn", { "maximum": 1, "when": "multiline" }],
      "react/button-has-type": "off",
      "react/jsx-sort-props": ["warn", {
        "callbacksLast": true,
        "shorthandFirst": false,
        "shorthandLast": true,
        "ignoreCase": true,
        "reservedFirst": true
      }],
      "react/forbid-prop-types": ["error", { "forbid": ["unknown"] }],
      "react/function-component-definition": ["error", { "namedComponents": "arrow-function", "unnamedComponents": "arrow-function" }]
    }
  },
  pluginReactJSXRuntime,

  // 6. Simple Import Sort configuration
  {
    ignores: ["eslint.config.mjs"],
    plugins: {
      "simple-import-sort": simpleImportSort
    },
    rules: {
      "simple-import-sort/imports": ["error", {
        "groups": [
          ["^\\u0000"], // Side effect imports
          ["^react", "^@?\\w"], // Packages (React first)
          ["^src", "^\\.\\.(?!/?$)", "^\\.\\./?$"], // Internal aliases & Parent imports
          ["^\\./(?=.*/)(?!/?$)", "^\\.(?!/?$)", "^\\./?$"], // Other relative imports
          ["^.+\\.s?css$"] // Style imports
        ]
      }],
      "simple-import-sort/exports": "error",
      "import/order": "off", // Disable conflicting rules
      "sort-imports": "off"
    }
  },

  // 7. Unused Imports configuration
  {
    plugins: {
      "unused-imports": unusedImports
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off", // Ensure TS rule is off too
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        { 
          "vars": "all", "varsIgnorePattern": "^_", "args": "after-used", "argsIgnorePattern": "^_" 
        }
      ]
    }
  },

  {
    files: [
        "./config/**/*.js",
        "jest.config.js" // Add if you have one and it uses require
    ],
    rules: {
      "@typescript-eslint/no-require-imports": "off"
     
      // "@typescript-eslint/no-var-requires": "off", // Often goes hand-in-hand
    }
  },

  // 8. Global language options and general rules overrides
  {
    languageOptions: {
      ecmaVersion: 2022, // Or "latest"
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021, // Or newer like es2022
        ...globals.jest
      }
    },
    rules: {
      // Your general rule overrides
      "array-callback-return": "off",
      "arrow-parens": ["error", "as-needed"],
      "class-methods-use-this": "warn",
      "comma-dangle": ["error", "unknown"],
      "function-paren-newline": "off",
      "import/extensions": "off",
      "import/no-extraneous-dependencies": "off",
      "import/no-unresolved": "off",
      "import/prefer-default-export": "off",
      "max-len": ["warn", {
         "code": 180, "ignoreStrings": true, "ignoreUrls": true 
        }], // Added ignoreUrls
      "no-console": "off", // Consider "warn" in production builds?
      "no-multiple-empty-lines": ["error", { "max": 1 }],
      "no-param-reassign": "off",
      "no-unused-expressions": "off", // Covered by unused-imports? Check carefully.
      "object-curly-newline": ["error", {
        "ObjectExpression": {
           "multiline": true, "minProperties": 3, "consistent": true 
          }, // Added consistent
        "ObjectPattern": {
           "multiline": true, "minProperties": 3, "consistent": true 
          }, // Added ObjectPattern & consistent
        "ImportDeclaration": {
           "multiline": true, "minProperties": 3, "consistent": true 
          }, // Added consistent
        "ExportDeclaration": {
           "multiline": true, "minProperties": 3, "consistent": true 
          } // Added ExportDeclaration & consistent
      }],
      "object-curly-spacing": ["error", "always"],
      "object-property-newline": ["error", { "allowAllPropertiesOnSameLine": true }],
      "padding-line-between-statements": [
        "error",
        {
           "blankLine": "always", "prev": "*", "next": "return" 
          }, // Blank before return
        {
           "blankLine": "always", "prev": ["const", "let", "var"], "next": "*" 
          }, // Blank after declarations
        {
           "blankLine": "unknown", "prev": ["const", "let", "var"], "next": ["const", "let", "var"]
          }, // No blank between declarations
        {
           "blankLine": "always", "prev": "directive", "next": "*" 
          }, // Blank after directives (e.g., "use strict")
        {
           "blankLine": "unknown", "prev": "directive", "next": "directive"
          },
        {
           "blankLine": "always", "prev": ["case", "default"], "next": "*" 
          }, // Blank after case/default
        {
           "blankLine": "always", "prev": "*", "next": ["if", "for", "while", "switch", "try", "class"] 
          }, // Blank before control structures/classes
        {
           "blankLine": "always", "prev": ["if", "for", "while", "switch", "try", "class"], "next": "*" 
          } // Blank after control structures/classes
      ],
      "template-curly-spacing": ["error", "unknown"],
      "lines-around-comment": ["error", {
        "beforeBlockComment": true,
        "afterBlockComment": false, // Common preference
        "beforeLineComment": true,
        "afterLineComment": false, // Common preference
        "allowBlockStart": true,
        "allowBlockEnd": false, // Common preference
        "allowObjectStart": true,
        "allowObjectEnd": true,
        "allowArrayStart": true,
        "allowArrayEnd": true,
        "allowClassStart": true, // Added
        "allowClassEnd": false // Added, common preference
      }]
    }
  }
];
