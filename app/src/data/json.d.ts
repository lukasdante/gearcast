// JSON data files are typed explicitly in ./index.ts (avoids inferring types from 1 MB of JSON).
declare module '*.json' {
  const value: unknown;
  export default value;
}
