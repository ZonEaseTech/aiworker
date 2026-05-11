import type { LocalLesson, LocalLessonStatus } from '@zonease/aiworker-shared'

import { localJson } from '../../../shared/api/local-client'

export function updateLesson(lessonId: string, status: LocalLessonStatus): Promise<{ lesson: LocalLesson }> {
  return localJson(`/api/local/lessons/${lessonId}`, { method: 'PATCH', body: JSON.stringify({ status }) })
}
