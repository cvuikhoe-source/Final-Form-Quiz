export const AI_LIMITS = {
  maxQuestionCount: 20,
  minQuestionCount: 1,
  maxInputChars: 2000,
  maxMessagesSent: 12,
  maxQuestionsInContext: 100,
  maxSourceTextChars: 15000,
} as const;

export const AI_QUICK_ACTIONS = [
  { id: 'generate', icon: '✨', label: 'Tạo thêm câu hỏi', needsForm: true },
  { id: 'review', icon: '✅', label: 'Kiểm tra đáp án' },
  { id: 'explanations', icon: '💡', label: 'Tạo giải thích', needsForm: true },
  { id: 'hints', icon: '🎯', label: 'Tạo gợi ý', needsForm: true },
  { id: 'rewrite', icon: '📝', label: 'Cải thiện câu hỏi' },
  { id: 'similar', icon: '🔄', label: 'Tạo câu tương tự', needsForm: true },
  { id: 'knowledge', icon: '📚', label: 'Giải thích kiến thức' },
  { id: 'structure', icon: '📊', label: 'Đánh giá cấu trúc bài' },
  { id: 'duplicates', icon: '🔍', label: 'Kiểm tra câu hỏi trùng' },
] as const;

export type AIQuickActionId = (typeof AI_QUICK_ACTIONS)[number]['id'];
