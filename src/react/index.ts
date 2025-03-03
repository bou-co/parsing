import { useState, useCallback, useRef, useEffect } from 'react';
import { AppObject, ParserFunction } from '../parser-types';
import { toHash } from '../to-hash';

export const useParserValue = <T, R extends object, O = T extends any[] ? R[] : R>(data: T, parser: ParserFunction<R>) => {
  const hasId = useRef<string | undefined>(undefined);
  const [result, setResult] = useState<O | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(undefined);

  const parse = useCallback(async () => {
    setLoading(true);
    try {
      const result = await parser(data as AppObject);
      setResult(result as O);
      setLoading(false);
      setError(undefined);
    } catch (error) {
      console.error('Error parsing data', { error, data, parser });
      setResult(undefined);
      setLoading(false);
      setError(error);
    }
  }, [data, parser]);

  useEffect(() => {
    const hash = toHash(data);
    if (hasId.current === hash) return;
    hasId.current = hash;
    parse();
  }, [parse]);

  return { result, loading, error };
};
