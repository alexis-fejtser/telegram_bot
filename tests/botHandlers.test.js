import test from 'node:test';
import assert from 'node:assert/strict';
import { Telegraf } from 'telegraf';

import { registerHandlers } from '../src/botHandlers.js';

test('registerHandlers регистрирует базовые хэндлеры без ошибок', () => {
    const bot = new Telegraf('123456:AAFakeTokenForLocalCheckOnly');

    assert.doesNotThrow(() => registerHandlers(bot));
});

test('registerHandlers можно вызвать до stage.middleware() и registerSceneActions()', async () => {
    const { Scenes } = await import('telegraf');
    const { registerSceneActions } = await import('../src/mainMenu.js');

    const bot = new Telegraf('123456:AAFakeTokenForLocalCheckOnly');

    assert.doesNotThrow(() => {
        registerHandlers(bot);
        const stage = new Scenes.Stage([]);
        bot.use(stage.middleware());
        registerSceneActions(bot);
    });
});
