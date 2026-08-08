import { describe, expect, it } from 'vitest';
import { extractToolOpsFromText, setAllowedCanvasToolKeys } from '../toolOpsContract';

describe('extractToolOpsFromText', () => {
  it('parses fenced ops JSON', () => {
    setAllowedCanvasToolKeys([]);
    const text = [
      'Sure, here is a plate.',
      '```json',
      JSON.stringify({
        ops: [
          {
            name: 'create_shape',
            args: { shapeType: 'rect', x: 10, y: 20, width: 100, height: 40 },
          },
        ],
      }),
      '```',
    ].join('\n');
    const ops = extractToolOpsFromText(text);
    expect(ops).toHaveLength(1);
    expect(ops[0]?.name).toBe('create_shape');
    expect(ops[0]?.args.shapeType).toBe('rect');
  });

  it('accepts tool/parameters aliases', () => {
    setAllowedCanvasToolKeys(['update_node']);
    const text = JSON.stringify({
      tools: [{ tool: 'update_node', parameters: { nodeId: 'n1', fill: '#111' } }],
    });
    const ops = extractToolOpsFromText(`\`\`\`\n${text}\n\`\`\``);
    expect(ops).toEqual([
      { name: 'update_node', args: { nodeId: 'n1', fill: '#111' } },
    ]);
  });

  it('drops disallowed tools when catalog is loaded', () => {
    setAllowedCanvasToolKeys(['create_text']);
    const text = '```json\n{"ops":[{"name":"delete_nodes","args":{"nodeIds":["n1"]}}]}\n```';
    expect(extractToolOpsFromText(text)).toEqual([]);
  });
});
