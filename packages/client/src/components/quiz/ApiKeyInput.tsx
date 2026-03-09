import { useState } from 'react';

import { ANTHROPIC_KEY_PREFIX, MIN_ANTHROPIC_KEY_LENGTH } from '@skills-trainer/shared';

import { FormField } from '@/components/common/FormField';
import { Button } from '@/components/common/Button';
import { setApiKey } from '@/store/apiKeyStore';
import styles from './ApiKeyInput.module.css';

const isValidKeyFormat = (key: string): boolean =>
  key.startsWith(ANTHROPIC_KEY_PREFIX) && key.length >= MIN_ANTHROPIC_KEY_LENGTH;

export const ApiKeyInput = () => {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    const trimmed = value.trim();

    if (!isValidKeyFormat(trimmed)) {
      setError(`Key must start with "${ANTHROPIC_KEY_PREFIX}" and be at least ${MIN_ANTHROPIC_KEY_LENGTH} characters`);
      return;
    }

    setError(null);
    setApiKey(trimmed);
  };

  return (
    <form onSubmit={handleSubmit} className={styles.container}>
      <p className={styles.description}>
        Free trial used. Enter your Anthropic API key to continue generating quizzes.
        Your key is never stored — it stays in memory until you refresh the page.
      </p>
      <FormField
        label="Anthropic API Key"
        type="password"
        placeholder="sk-ant-..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        error={error ?? undefined}
        autoComplete="off"
      />
      <Button type="submit" variant="primary" disabled={!value.trim()}>
        Save Key
      </Button>
    </form>
  );
};
