/** Image / text AI prompt presets for the selection toolbar. */
export function imageAgentPrompts(box: { width: number; height: number }) {
  const wh = `${Math.round(box.width)}×${Math.round(box.height)}`;
  return {
    upscale: '请针对选中图片给出高清放大方案：推荐倍率、锐化与导出注意事项。',
    removeBg: '请给选中图片做去背景处理建议与流程（边缘、阴影、透明底），适合放到简历/海报上。',
    eraser: '请说明如何用橡皮工具擦除选中区域的多余内容，并给出修补/清理步骤。',
    editElements: '请识别并拆分选中图片中的图层元素（人物、文字、装饰等），给出可编辑元素列表与编辑建议。',
    editText: '请识别选中图片中的文字，列出文案并给出可编辑/改写方案。',
    multiAngle: '请针对当前图片给出多角度/多视角再生成建议（正视、侧视、局部等）与构图注意点。',
    moveObject: '请说明如何在画布中移动/对齐当前对象，并给出排版避让建议。',
    mockup: '请为选中图片给出 Mockup 落地展示建议（场景、材质、光照），适合作品集展示。',
    expand: '请规划图片外扩/续写边缘的方案（方向、比例、内容延续），并给出结果尺寸建议。',
    adjust: '请为选中图片给出曝光、对比度、色温、饱和度等调整参数建议。',
    crop: `请帮我规划裁剪方案（当前约 ${wh}）：推荐裁切区域与最终比例。`,
    vector: '请说明如何将当前图片转为可编辑矢量（路径/形状），以及在本编辑器中的可行步骤。',
    flipRotate: '请给出翻转与旋转建议（水平/垂直翻转、常用角度），说明适用场景。',
  };
}

export const TEXT_REWRITE_PROMPT =
  '请改写选中文字，使其更专业简洁，适合简历。直接给出改写结果。';
