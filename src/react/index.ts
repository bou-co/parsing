import { useState, useCallback, useRef, useEffect } from 'react';
import { ParserFunction, ParserReturnValue } from '../parser-types';
import { toHash } from '../to-hash';

export const useParserValue = <R extends ParserFunction<object>>(data: any, parser: R) => {
  type Result = ParserReturnValue<R>;
  const hasId = useRef<string | undefined>(undefined);
  const [result, setResult] = useState<Result | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(undefined);

  const parse = useCallback(async () => {
    setLoading(true);
    try {
      const result = await parser(data);
      setResult(result as Result);
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
  }, [data, parse]);

  return { result, loading, error };
};
