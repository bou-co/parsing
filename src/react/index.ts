import { useState, useCallback, useRef, useEffect } from 'react';
import { ParserFunction, ParserReturnValue } from '../parser-types';
import { toHash } from '../to-hash';

export const useParserValue = <R extends ParserFunction<object>>(incomingData: any, parser: R) => {
  type Result = ParserReturnValue<R>;

  const _data = useRef(incomingData);
  const hasId = useRef<string | undefined>(undefined);
  const [result, setResult] = useState<Result | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(undefined);

  const parse = useCallback(async () => {
    setLoading(true);
    try {
      const result = await parser(_data.current);
      setResult(result as Result);
      setLoading(false);
      setError(undefined);
    } catch (error) {
      console.error('Error parsing data', { error, data: _data.current, parser });
      setResult(undefined);
      setLoading(false);
      setError(error);
    }
  }, [incomingData, parser]);

  useEffect(() => {
    _data.current = incomingData;
    const hash = toHash(_data.current);
    if (hasId.current === hash) return;
    hasId.current = hash;
    parse();
  }, [incomingData, parse]);

  const revalidate = useCallback(
    (updatedData = _data.current) => {
      _data.current = updatedData;
      hasId.current = undefined;
      const hash = toHash(updatedData);
      hasId.current = hash;
      parse();
    },
    [parse],
  );

  return { result, loading, error, revalidate };
};
