import { z } from 'zod';

/**
 * Scene document validation for JSON import (mirrors workflow Zod.safeParse flow).
 * Required: width, height, deltaSetLike.ROOT.children — extra fields allowed.
 */

const RootNodeSchema = z
  .object({
    children: z.array(z.string(), { required_error: 'ROOT.children is required' }),
  })
  .catchall(z.unknown());

const SceneNodeSchema = z
  .object({
    key: z.enum(['text', 'rect', 'shape', 'image'], {
      errorMap: () => ({ message: 'Node key must be text | rect | shape | image' }),
    }),
    x: z.number({ required_error: 'Node x is required' }),
    y: z.number({ required_error: 'Node y is required' }),
    width: z.number({ required_error: 'Node width is required' }),
    height: z.number({ required_error: 'Node height is required' }),
  })
  .catchall(z.unknown());

const DeltaSetLikeSchema = z
  .object({
    ROOT: RootNodeSchema,
  })
  .catchall(z.union([SceneNodeSchema, z.record(z.unknown())]));

export const SceneDocumentSchema = z
  .object({
    width: z.number({ required_error: 'width is required' }),
    height: z.number({ required_error: 'height is required' }),
    deltaSetLike: DeltaSetLikeSchema,
  })
  .catchall(z.unknown());

export type SceneDocumentImport = z.infer<typeof SceneDocumentSchema>;

export type ValidateSceneResult =
  | { valid: true; data: SceneDocumentImport }
  | { valid: false; error: string };

/** Validate parsed JSON as a scene document. */
export function validateSceneDocument(data: unknown): ValidateSceneResult {
  try {
    const result = SceneDocumentSchema.safeParse(data);
    if (result.success) {
      return { valid: true, data: result.data };
    }
    const errorMessages = result.error.issues.map((err) => {
      const path = err.path.join('.');
      return path ? `${path}: ${err.message}` : err.message;
    });
    return {
      valid: false,
      error: `Validation failed: ${errorMessages.join('; ')}`,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown validation error',
    };
  }
}

/** Parse file text → JSON → schema check. */
export function parseAndValidateSceneJson(rawText: string): ValidateSceneResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { valid: false, error: 'Invalid JSON format' };
  }
  return validateSceneDocument(parsed);
}
