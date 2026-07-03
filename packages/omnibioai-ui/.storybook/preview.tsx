import type { Preview } from '@storybook/react-vite';
import '../../omnibioai-design-tokens/tokens.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'dark', value: '#0d1117' },
        { name: 'surface', value: '#161b27' },
      ],
    },
    a11y: {
      test: 'todo',
    },
  },
};

export default preview;
