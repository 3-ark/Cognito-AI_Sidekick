import { extractAndParseJsonArguments } from '../hooks/useTools';
import { robustlyParseLlmResponseForToolCall } from '../hooks/useSendMessage';

describe('extractAndParseJsonArguments', () => {
  it('should parse plain valid JSON', () => {
    expect(extractAndParseJsonArguments('{"key": "value"}')).toEqual({ key: "value" });
  });

  it('should parse plain valid JSON with leading/trailing whitespace', () => {
    expect(extractAndParseJsonArguments('  {"key": "value"}  ')).toEqual({ key: "value" });
  });

  it('should parse JSON from ```json fence', () => {
    expect(extractAndParseJsonArguments('```json\n{"key": "fenced"}\n```')).toEqual({ key: "fenced" });
  });

  it('should parse JSON from ```json fence with leading/trailing whitespace around ticks', () => {
    expect(extractAndParseJsonArguments('  ```json\n{"key": "fenced"}\n```  ')).toEqual({ key: "fenced" });
  });

  it('should parse multiline JSON from ```json fence', () => {
    const jsonString = '```json\n{\n  "key": "multiline",\n  "number": 123\n}\n```';
    expect(extractAndParseJsonArguments(jsonString)).toEqual({ key: "multiline", number: 123 });
  });

  it('should parse JSON from ``` (generic) fence', () => {
    expect(extractAndParseJsonArguments('```\n{"key": "generic_fenced"}\n```')).toEqual({ key: "generic_fenced" });
  });
  
  it('should parse multiline JSON from ``` (generic) fence', () => {
    const jsonString = '```\n{\n  "key": "generic_multiline",\n  "bool": true\n}\n```';
    expect(extractAndParseJsonArguments(jsonString)).toEqual({ key: "generic_multiline", bool: true });
  });

  it('should extract and parse JSON by finding first { and last }', () => {
    expect(extractAndParseJsonArguments('Some text before {"key": "substring"} and after.')).toEqual({ key: "substring" });
  });

  it('should extract and parse JSON by finding first { and last } with noise', () => {
    expect(extractAndParseJsonArguments('```markdown\nHere is some json: {"key": "complex substring"}\nAnd other details.\n```')).toEqual({ key: "complex substring" });
  });
  
  it('should prioritize direct parsing', () => {
    expect(extractAndParseJsonArguments('{"key": "direct"}')).toEqual({ key: "direct" });
  });

  it('should prioritize ```json over ``` and substring', () => {
    const str = '```json\n{"key": "json_fence"}\n```\n```\n{"key": "generic_fence"}\n```\n{"key": "substring"}';
    expect(extractAndParseJsonArguments(str)).toEqual({ key: "json_fence" });
  });

  it('should prioritize ``` over substring if ```json fails or not present', () => {
    const str = 'Some text\n```\n{"key": "generic_fence"}\n```\n{"key": "substring"}';
    expect(extractAndParseJsonArguments(str)).toEqual({ key: "generic_fence" });
  });

  it('should throw error for invalid JSON (incomplete)', () => {
    expect(() => extractAndParseJsonArguments('{"key": "invalid"')).toThrow('Failed to parse arguments string as JSON after multiple attempts.');
  });

  it('should throw error for invalid JSON inside fence', () => {
    expect(() => extractAndParseJsonArguments('```json\n{"key": "invalid"\n```')).toThrow('Failed to parse arguments string as JSON after multiple attempts.');
  });
  
  it('should throw error for invalid JSON in substring attempt', () => {
    expect(() => extractAndParseJsonArguments('prefix { "key": "value" suffix')).toThrow('Failed to parse arguments string as JSON after multiple attempts.');
  });

  it('should throw error for non-JSON string', () => {
    expect(() => extractAndParseJsonArguments('just plain text')).toThrow('Failed to parse arguments string as JSON after multiple attempts.');
  });

  it('should throw error for empty string', () => {
    expect(() => extractAndParseJsonArguments('')).toThrow('Failed to parse arguments string as JSON after multiple attempts.');
  });

  it('should throw error for whitespace string', () => {
    expect(() => extractAndParseJsonArguments('   ')).toThrow('Failed to parse arguments string as JSON after multiple attempts.');
  });
  
  it('should handle JSON-like string that is not valid JSON in substring match', () => {
    // This will pass the substring extraction but fail JSON.parse
    expect(() => extractAndParseJsonArguments('prefix {key: "not really json"} suffix')).toThrow('Failed to parse arguments string as JSON after multiple attempts.');
  });
});

describe('robustlyParseLlmResponseForToolCall', () => {
  it('should parse plain valid JSON', () => {
    expect(robustlyParseLlmResponseForToolCall('{"tool": "A"}')).toEqual({ tool: "A" });
  });

  it('should parse plain valid JSON with leading/trailing whitespace', () => {
    expect(robustlyParseLlmResponseForToolCall('  {"tool": "A"}  ')).toEqual({ tool: "A" });
  });

  it('should parse JSON from ```json fence', () => {
    expect(robustlyParseLlmResponseForToolCall('```json\n{"tool": "B"}\n```')).toEqual({ tool: "B" });
  });
  
  it('should parse JSON from ```json fence with .s flag (multiline content)', () => {
    expect(robustlyParseLlmResponseForToolCall('```json\n{\n"tool": "B",\n"param": "multi"\n}\n```')).toEqual({ tool: "B", param: "multi" });
  });

  it('should parse JSON from ``` (generic) fence', () => {
    expect(robustlyParseLlmResponseForToolCall('```\n{"tool": "C"}\n```')).toEqual({ tool: "C" });
  });

  it('should parse JSON from ``` (generic) fence with .s flag (multiline content)', () => {
    expect(robustlyParseLlmResponseForToolCall('```\n{\n"tool": "C",\n"param": "multi"\n}\n```')).toEqual({ tool: "C", param: "multi" });
  });
  
  it('should extract and parse JSON by finding first { and last }', () => {
    expect(robustlyParseLlmResponseForToolCall('Some text before {"tool": "D"} and after.')).toEqual({ tool: "D" });
  });

  it('should extract and parse JSON by finding first { and last } with noise and newlines', () => {
    expect(robustlyParseLlmResponseForToolCall('```markdown\nHere is some json: \n{"tool": "D", "param": "complex substring"}\nAnd other details.\n```')).toEqual({ tool: "D", param: "complex substring" });
  });

  it('should prioritize direct parsing', () => {
    expect(robustlyParseLlmResponseForToolCall('{"tool": "direct"}')).toEqual({ tool: "direct" });
  });

  it('should prioritize ```json over ``` and substring', () => {
    const str = '```json\n{"tool": "json_fence"}\n```\n```\n{"tool": "generic_fence"}\n```\n{"tool": "substring"}';
    expect(robustlyParseLlmResponseForToolCall(str)).toEqual({ tool: "json_fence" });
  });

  it('should prioritize ``` over substring if ```json fails or not present', () => {
    const str = 'Some text\n```\n{"tool": "generic_fence"}\n```\n{"tool": "substring"}';
    expect(robustlyParseLlmResponseForToolCall(str)).toEqual({ tool: "generic_fence" });
  });

  it('should return null for invalid JSON (incomplete)', () => {
    expect(robustlyParseLlmResponseForToolCall('{"tool": "invalid"')).toBeNull();
  });
  
  it('should return null for invalid JSON inside fence', () => {
    expect(robustlyParseLlmResponseForToolCall('```json\n{"tool": "invalid"\n```')).toBeNull();
  });

  it('should return null for invalid JSON in substring attempt', () => {
    expect(robustlyParseLlmResponseForToolCall('prefix { "tool": "value" suffix')).toBeNull();
  });
  
  it('should return null for non-JSON string', () => {
    expect(robustlyParseLlmResponseForToolCall('just plain text')).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(robustlyParseLlmResponseForToolCall('')).toBeNull();
  });

  it('should return null for whitespace string', () => {
    expect(robustlyParseLlmResponseForToolCall('   ')).toBeNull();
  });
  
  it('should handle JSON-like string that is not valid JSON in substring match and return null', () => {
    expect(robustlyParseLlmResponseForToolCall('prefix {tool: "not really json"} suffix')).toBeNull();
  });
});
