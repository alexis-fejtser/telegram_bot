import express from 'express';
import { Question } from '../../src/models/Question.js';
import { User } from '../../src/models/User.js';
import { createModuleLogger } from '../../src/config/logger.js';

const log = createModuleLogger('api:questions');

export default function createQuestionsRouter(botInstance) {
    const router = express.Router();

    router.get('/', async (req, res) => {
        try {
            const { status } = req.query;
            const where = status ? { status } : {};
            const questions = await Question.findAll({
                where,
                order: [['createdAt', 'DESC']],
            });

            res.json(questions);
        } catch (error) {
            log.error('Questions list error:', { message: error.message });
            res.status(500).json({ error: error.message });
        }
    });

    router.post('/:id/answer', async (req, res) => {
        try {
            const { id } = req.params;
            const { answerText } = req.body;

            const question = await Question.findByPk(id);
            if (!question) {
                return res.status(404).json({ error: 'Question not found' });
            }

            await question.update({
                answerText,
                status: 'answered',
                answeredAt: new Date(),
            });

            let warning = null;

            if (botInstance) {
                try {
                    await botInstance.telegram.sendMessage(
                        question.telegramId,
                        `💬 <b>Ответ на ваш вопрос от менеджера:</b>\n\n${answerText}`,
                        { parse_mode: 'HTML' }
                    );
                } catch (tgError) {
                    log.error('Failed to send answer via Telegram:', { message: tgError.message });

                    const isBlocked =
                        tgError.code === 403 ||
                        tgError.message?.includes('blocked') ||
                        tgError.message?.includes('Forbidden');

                    if (isBlocked) {
                        await User.update(
                            { status: 'blocked', statusUpdatedAt: new Date() },
                            { where: { telegramId: question.telegramId } }
                        );
                        warning = 'Пользователь заблокировал бота — ответ сохранён, но не доставлен.';
                    } else {
                        warning = 'Ответ сохранён, но не доставлен в Telegram. Попробуйте позже.';
                    }
                }
            }

            res.json({ success: true, question, warning });
        } catch (error) {
            log.error('Answer question error:', { message: error.message });
            res.status(500).json({ error: error.message });
        }
    });

    return router;
}
