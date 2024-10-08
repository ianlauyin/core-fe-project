// @ts-check
const eslintConfigPrettier = require("eslint-config-prettier");
const eslint = require("@eslint/js");
const tsESlint = require("typescript-eslint");

module.exports = tsESlint.config(
    {
        files: ["**/*.js", "**/*.jsx", "**/*.ts", "**/*.tsx"],
        plugins: {
            "@typescript-eslint": tsESlint.plugin,
        },
        extends: [eslint.configs.recommended, ...tsESlint.configs.recommended, tsESlint.configs.eslintRecommended, eslintConfigPrettier],
        languageOptions: {
            parser: tsESlint.parser,
            parserOptions: {
                ecmaVersion: 2018,
                sourceType: "module",
                ecmaFeatures: {jsx: true},
            },
        },
        rules: {
            "@typescript-eslint/ban-types": "off",
            "@typescript-eslint/no-empty-object-type": "off",
            "@typescript-eslint/explicit-function-return-type": "off",
            "@typescript-eslint/explicit-member-accessibility": ["error", {accessibility: "no-public"}],
            "@typescript-eslint/explicit-module-boundary-types": "off",
            "@typescript-eslint/member-ordering": [
                "error",
                {
                    default: {
                        memberTypes: [
                            "public-static-field",
                            "protected-static-field",
                            "private-static-field",
                            "public-static-method",
                            "protected-static-method",
                            "private-static-method",
                            "public-instance-field",
                            "protected-instance-field",
                            "private-instance-field",
                            "public-abstract-field",
                            "protected-abstract-field",
                            "public-constructor",
                            "protected-constructor",
                            "private-constructor",
                            "public-instance-method",
                            "protected-instance-method",
                            "private-instance-method",
                            "public-abstract-method",
                            "protected-abstract-method",
                        ],
                        order: "as-written",
                    },
                },
            ],
            "@typescript-eslint/no-empty-function": "off",
            "@typescript-eslint/no-empty-interface": "off",
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-inferrable-types": "off",
            "@typescript-eslint/no-non-null-assertion": "off",
            "@typescript-eslint/no-unused-vars": "off",
            "@typescript-eslint/no-use-before-define": ["error", "nofunc"],
            "@typescript-eslint/ban-ts-comment": "off",
            "no-console": ["error", {allow: ["info", "warn", "error"]}],
            "no-duplicate-imports": ["error"],
            "no-useless-computed-key": ["error"],
            "no-useless-rename": ["error"],
            "no-var": ["error"],
            "object-shorthand": "error",
            "prefer-const": ["error"],
            "require-yield": "off",
        },
    },
    {
        files: ["**/*.config.js", "**/*.config.jsx", "**/*.config.ts", "**/*.config.tsx", "**/script/*.js"],
        rules: {
            "@typescript-eslint/no-require-imports": "off",
        },
    },
    {
        ignores: ["**/build/**/*", "**/dist/**/*", "**/node_modules/**/*"],
    }
);
