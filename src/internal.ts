export const getFromObject = async (from: object, path: string) => {
  type VariablesObj = Record<any, any> | undefined;
  if (!from) return undefined;
  const keys = path.split('.');
  return keys.reduce((acc, key): VariablesObj => {
    if (!acc) return undefined;
    if (typeof acc !== 'object') return undefined;
    if (key in acc) return acc[key];
    return undefined;
  }, from as VariablesObj);
};
