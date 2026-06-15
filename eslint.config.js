import tseslint from '@typescript-eslint/eslint-plugin';

export default [
  ...tseslint.configs['flat/recommended'],
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn', // предупреждаем о потере типизации
      'no-unused-vars': 'off', // отключаем базовое правило, чтобы не спотыкаться об допустимые неиспользуемые переменные
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }], // разрешаем намеренно неиспользуемые аргументы, если их имя начинается с подчеркивания
    },
  },
];
