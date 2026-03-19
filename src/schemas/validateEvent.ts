/**
 * Socket event payload doğrulama yardımcısı
 */

import { z } from 'zod';
import type { Socket } from 'socket.io';
import log from '../utils/logger';

/**
 * Socket event payload'ını zod şemasıyla doğrular.
 * Başarısızsa socket'e hata gönderir ve null döner.
 */
export function validatePayload<T extends z.ZodTypeAny>(
    schema: T,
    data: unknown,
    socket: Socket,
    eventName: string
): z.infer<T> | null {
    const result = schema.safeParse(data);

    if (!result.success) {
        const errors = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
        log.warn({ event: eventName, errors, socketId: socket.id }, 'Gecersiz event payload');
        socket.emit('VALIDATION_ERROR', {
            event: eventName,
            errors: result.error.issues.map(i => ({
                field: i.path.join('.'),
                message: i.message
            }))
        });
        return null;
    }

    return result.data;
}
