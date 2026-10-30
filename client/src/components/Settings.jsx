import React, { useEffect, useState } from 'react';
import { Save, ShieldCheck, Bot, Timer, MessageSquareText, KeyRound, AlertTriangle, Flame } from 'lucide-react';

const TIMER_FIELDS = [
    { key: 'stepDelayMs', label: 'Задержка между сообщениями шага', hint: 'Пауза перед каждым следующим сообщением внутри шага' },
    { key: 'stepTimeoutMs', label: 'Таймаут автоперехода шага', hint: 'Через сколько шаг автоматически сменится на следующий' },
    { key: 'leadNextDelayMs', label: 'Задержка после заявки (консультация)', hint: 'Через сколько после lead:consultation бот идёт дальше' },
];

const TEXT_FIELDS = [
    { key: 'consultation', label: 'Заявка на консультацию (lead:consultation)', hint: 'Сообщение пользователю с контактами. Поддерживается HTML.', rows: 2 },
    { key: 'questionPrompt', label: 'Приглашение задать вопрос (lead:question)', hint: 'Что бот пишет, когда пользователь нажал «Задать вопрос».', rows: 2 },
    { key: 'questionThanks', label: 'Спасибо за вопрос', hint: 'Ответ пользователю после успешной отправки вопроса менеджеру.', rows: 2 },
    { key: 'questionError', label: 'Ошибка отправки вопроса', hint: 'Ответ, если вопрос не удалось отправить менеджеру.', rows: 2 },
    { key: 'questionNotText', label: 'Вопрос не текстом', hint: 'Ответ, если пользователь прислал не текстовое сообщение.', rows: 2 },
    {
        key: 'managerNotification',
        label: 'Уведомление менеджеру о новом вопросе',
        hint: 'Шаблон с подстановками: {name}, {username}, {telegramId}, {question}. Поддерживается HTML.',
        rows: 8,
    },
];

const secondsHint = (ms) => {
    const seconds = Number(ms) / 1000;
    if (!Number.isFinite(seconds)) return '';
    return `≈ ${seconds.toLocaleString('ru-RU')} сек`;
};

export default function Settings() {
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);

    const [botForm, setBotForm] = useState({ botToken: '', managerId: '' });
    const [timerForm, setTimerForm] = useState({ stepDelayMs: 0, stepTimeoutMs: 0, leadNextDelayMs: 0 });
    const [textsForm, setTextsForm] = useState({});
    const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });

    const [savingSection, setSavingSection] = useState(null);
    const [messages, setMessages] = useState({});

    const [warmupLoading, setWarmupLoading] = useState(false);
    const [warmupForce, setWarmupForce] = useState(false);
    const [warmupResult, setWarmupResult] = useState(null);
    const [cacheStatus, setCacheStatus] = useState(null);

    const fetchCacheStatus = () => {
        fetch('/api/assets/cache-status')
            .then((res) => res.json())
            .then((data) => setCacheStatus(data))
            .catch(() => {});
    };

    useEffect(() => {
        fetchCacheStatus();
    }, []);

    const handleWarmup = async () => {
        setWarmupLoading(true);
        setWarmupResult(null);
        try {
            const res = await fetch('/api/assets/warmup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ force: warmupForce }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Ошибка прогрева');
            }
            setWarmupResult(data);
            fetchCacheStatus();
        } catch (err) {
            setWarmupResult({ error: err.message });
        } finally {
            setWarmupLoading(false);
        }
    };

    useEffect(() => {
        fetch('/api/settings')
            .then((res) => res.json())
            .then((data) => {
                setSettings(data);
                setBotForm({ botToken: '', managerId: data.managerId || '' });
                setTimerForm({
                    stepDelayMs: data.stepDelayMs ?? 0,
                    stepTimeoutMs: data.stepTimeoutMs ?? 0,
                    leadNextDelayMs: data.leadNextDelayMs ?? 0,
                });
                setTextsForm({ ...(data.texts || {}) });
                setLoading(false);
            })
            .catch((err) => {
                console.error(err);
                setLoading(false);
            });
    }, []);

    const setMessage = (section, type, text) => {
        setMessages((prev) => ({ ...prev, [section]: { type, text } }));
        if (type === 'success') {
            setTimeout(() => {
                setMessages((prev) => ({ ...prev, [section]: null }));
            }, 4000);
        }
    };

    const saveSettings = async (section, payload) => {
        setSavingSection(section);
        try {
            const res = await fetch('/api/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();

            if (!res.ok || !data.success) {
                setMessage(section, 'error', data.error || 'Ошибка сохранения');
                return;
            }

            setSettings(data.settings);
            setTextsForm({ ...(data.settings.texts || {}) });
            setBotForm((prev) => ({ ...prev, botToken: '', managerId: data.settings.managerId || '' }));
            setMessage(section, 'success', 'Настройки сохранены');
        } catch (err) {
            setMessage(section, 'error', 'Ошибка сервера');
        } finally {
            setSavingSection(null);
        }
    };

    const handleSaveBot = (e) => {
        e.preventDefault();
        const payload = { managerId: botForm.managerId };
        if (botForm.botToken.trim() !== '') {
            payload.botToken = botForm.botToken.trim();
        }
        saveSettings('bot', payload);
    };

    const handleSaveTimers = (e) => {
        e.preventDefault();
        saveSettings('timers', {
            stepDelayMs: Number(timerForm.stepDelayMs),
            stepTimeoutMs: Number(timerForm.stepTimeoutMs),
            leadNextDelayMs: Number(timerForm.leadNextDelayMs),
        });
    };

    const handleSaveTexts = (e) => {
        e.preventDefault();
        saveSettings('texts', { texts: textsForm });
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();

        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            setMessage('password', 'error', 'Пароли не совпадают');
            return;
        }

        setSavingSection('password');
        try {
            const res = await fetch('/api/settings/password', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    currentPassword: passwordForm.currentPassword,
                    newPassword: passwordForm.newPassword,
                }),
            });
            const data = await res.json();

            if (!res.ok || !data.success) {
                setMessage('password', 'error', data.error || 'Ошибка смены пароля');
                return;
            }

            setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
            setMessage('password', 'success', 'Пароль изменён');
        } catch (err) {
            setMessage('password', 'error', 'Ошибка сервера');
        } finally {
            setSavingSection(null);
        }
    };

    const renderMessage = (section) => {
        const message = messages[section];
        if (!message) return null;
        return (
            <p className={`text-xs font-medium ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                {message.text}
            </p>
        );
    };

    if (loading) return <div className="p-6 text-gray-500">Загрузка настроек...</div>;

    if (!settings) return <div className="p-6 text-red-500">Не удалось загрузить настройки</div>;

    return (
        <div className="space-y-6 max-w-3xl">
            <h1 className="text-2xl font-bold text-gray-800">Настройки</h1>

            {settings.restartRequired && (
                <div className="flex items-center gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-yellow-800 text-sm">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    Токен бота изменён. Новый токен применится после перезапуска бота (npm start).
                </div>
            )}

            {/* Bot access */}
            <form onSubmit={handleSaveBot} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-4">
                <div className="flex items-center gap-2 text-gray-800">
                    <Bot className="w-5 h-5 text-blue-600" />
                    <h2 className="font-semibold">Доступ к боту</h2>
                </div>

                <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">Токен бота</label>
                    <input
                        type="password"
                        value={botForm.botToken}
                        onChange={(e) => setBotForm((prev) => ({ ...prev, botToken: e.target.value }))}
                        placeholder={settings.botTokenMasked || 'не задан'}
                        autoComplete="off"
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none font-mono"
                    />
                    <p className="text-xs text-gray-400">
                        Оставьте пустым, чтобы не менять. Текущий токен: {settings.botTokenMasked || 'не задан'}
                        {settings.hasCustomBotToken ? ' (задан в настройках)' : ' (из .env)'}.
                        Изменение применится после перезапуска бота.
                    </p>
                </div>

                <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">MANAGER_ID (Telegram ID менеджера)</label>
                    <input
                        type="text"
                        value={botForm.managerId}
                        onChange={(e) => setBotForm((prev) => ({ ...prev, managerId: e.target.value }))}
                        placeholder="Например: 123456789"
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none font-mono"
                    />
                    <p className="text-xs text-gray-400">Кому бот отправляет уведомления о новых вопросах.</p>
                </div>

                <div className="flex items-center justify-between">
                    {renderMessage('bot')}
                    <button
                        type="submit"
                        disabled={savingSection === 'bot'}
                        className="ml-auto flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
                    >
                        <Save className="w-4 h-4" />
                        {savingSection === 'bot' ? 'Сохранение...' : 'Сохранить'}
                    </button>
                </div>
            </form>

            {/* Media Warmup Card */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-gray-800">
                        <Flame className="w-5 h-5 text-orange-500" />
                        <h2 className="font-semibold">Прогрев медиафайлов (file-id кэш)</h2>
                    </div>
                    {cacheStatus && (
                        <span className="text-xs bg-orange-50 text-orange-700 border border-orange-200 px-2.5 py-1 rounded-full font-medium">
                            В кэше: {cacheStatus.cachedCount} файлов
                        </span>
                    )}
                </div>

                <p className="text-xs text-gray-500 leading-relaxed">
                    Отправляет все медиафайлы ботом в чат менеджеру (MANAGER_ID), получает уникальные <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-700">file_id</code> от Telegram и сохраняет их в локальный кэш (<code className="bg-gray-100 px-1 py-0.5 rounded text-gray-700">.cache/telegram-file-ids.json</code>). Это позволяет доставлять медиа пользователям мгновенно без повторной выгрузки на серверы Telegram.
                </p>

                <div className="flex items-center gap-2 pt-1">
                    <input
                        type="checkbox"
                        id="warmupForce"
                        checked={warmupForce}
                        onChange={(e) => setWarmupForce(e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="warmupForce" className="text-xs text-gray-700 select-none cursor-pointer">
                        Принудительно (перепрогреть все медиа, даже если они уже сохранены в кэше)
                    </label>
                </div>

                {warmupResult && (
                    <div className={`p-4 rounded-xl text-xs space-y-1.5 ${
                        warmupResult.error
                            ? 'bg-red-50 border border-red-200 text-red-800'
                            : 'bg-green-50 border border-green-200 text-green-800'
                    }`}>
                        {warmupResult.error ? (
                            <div className="flex items-start gap-2">
                                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-semibold">Не удалось завершить прогрев:</p>
                                    <p>{warmupResult.error}</p>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <p className="font-semibold text-sm mb-1">🎉 Прогрев медиафайлов завершён успешно!</p>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pt-2">
                                    <div className="bg-white/80 p-2 rounded-lg border border-green-200">
                                        <span className="block text-gray-500 text-[10px] uppercase">Всего</span>
                                        <span className="font-bold text-gray-800 text-sm">{warmupResult.total}</span>
                                    </div>
                                    <div className="bg-white/80 p-2 rounded-lg border border-green-200">
                                        <span className="block text-green-600 text-[10px] uppercase">Прогрето</span>
                                        <span className="font-bold text-green-700 text-sm">{warmupResult.warmed}</span>
                                    </div>
                                    <div className="bg-white/80 p-2 rounded-lg border border-green-200">
                                        <span className="block text-blue-600 text-[10px] uppercase">Уже в кэше</span>
                                        <span className="font-bold text-blue-700 text-sm">{warmupResult.skipped}</span>
                                    </div>
                                    <div className="bg-white/80 p-2 rounded-lg border border-green-200">
                                        <span className="block text-red-600 text-[10px] uppercase">Ошибок</span>
                                        <span className="font-bold text-red-700 text-sm">{warmupResult.failed}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <div className="flex items-center justify-end pt-2">
                    <button
                        type="button"
                        onClick={handleWarmup}
                        disabled={warmupLoading}
                        className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
                    >
                        <Flame className={`w-4 h-4 ${warmupLoading ? 'animate-pulse' : ''}`} />
                        {warmupLoading ? 'Прогрев медиа...' : 'Запустить прогрев медиа'}
                    </button>
                </div>
            </div>

            {/* Timers */}
            <form onSubmit={handleSaveTimers} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-4">
                <div className="flex items-center gap-2 text-gray-800">
                    <Timer className="w-5 h-5 text-blue-600" />
                    <h2 className="font-semibold">Таймеры (в миллисекундах)</h2>
                </div>

                {TIMER_FIELDS.map((field) => (
                    <div key={field.key} className="space-y-1">
                        <label className="text-xs font-semibold text-gray-500 uppercase">{field.label}</label>
                        <div className="flex items-center gap-3">
                            <input
                                type="number"
                                min={0}
                                max={86400000}
                                step={100}
                                value={timerForm[field.key]}
                                onChange={(e) => setTimerForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                                className="w-48 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none font-mono"
                            />
                            <span className="text-xs text-gray-400">{secondsHint(timerForm[field.key])}</span>
                        </div>
                        <p className="text-xs text-gray-400">{field.hint}</p>
                    </div>
                ))}

                <div className="flex items-center justify-between">
                    {renderMessage('timers')}
                    <button
                        type="submit"
                        disabled={savingSection === 'timers'}
                        className="ml-auto flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
                    >
                        <Save className="w-4 h-4" />
                        {savingSection === 'timers' ? 'Сохранение...' : 'Сохранить'}
                    </button>
                </div>
            </form>

            {/* Lead texts */}
            <form onSubmit={handleSaveTexts} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-4">
                <div className="flex items-center gap-2 text-gray-800">
                    <MessageSquareText className="w-5 h-5 text-blue-600" />
                    <h2 className="font-semibold">Тексты лидов</h2>
                </div>

                {TEXT_FIELDS.map((field) => (
                    <div key={field.key} className="space-y-1">
                        <label className="text-xs font-semibold text-gray-500 uppercase">{field.label}</label>
                        <textarea
                            rows={field.rows}
                            value={textsForm[field.key] || ''}
                            onChange={(e) => setTextsForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none"
                        />
                        <p className="text-xs text-gray-400">{field.hint}</p>
                    </div>
                ))}

                <div className="flex items-center justify-between">
                    {renderMessage('texts')}
                    <button
                        type="submit"
                        disabled={savingSection === 'texts'}
                        className="ml-auto flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
                    >
                        <Save className="w-4 h-4" />
                        {savingSection === 'texts' ? 'Сохранение...' : 'Сохранить'}
                    </button>
                </div>
            </form>

            {/* Admin password */}
            <form onSubmit={handleChangePassword} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-4">
                <div className="flex items-center gap-2 text-gray-800">
                    <KeyRound className="w-5 h-5 text-blue-600" />
                    <h2 className="font-semibold">Пароль администратора</h2>
                </div>

                <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">Текущий пароль</label>
                    <input
                        type="password"
                        value={passwordForm.currentPassword}
                        onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
                        autoComplete="current-password"
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none"
                        required
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-500 uppercase">Новый пароль</label>
                        <input
                            type="password"
                            value={passwordForm.newPassword}
                            onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                            autoComplete="new-password"
                            minLength={6}
                            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none"
                            required
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-500 uppercase">Повторите пароль</label>
                        <input
                            type="password"
                            value={passwordForm.confirmPassword}
                            onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                            autoComplete="new-password"
                            minLength={6}
                            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none"
                            required
                        />
                    </div>
                </div>

                <p className="text-xs text-gray-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Пароль хранится в БД в виде scrypt-хэша. Минимальная длина — 6 символов.
                </p>

                <div className="flex items-center justify-between">
                    {renderMessage('password')}
                    <button
                        type="submit"
                        disabled={savingSection === 'password'}
                        className="ml-auto flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
                    >
                        <Save className="w-4 h-4" />
                        {savingSection === 'password' ? 'Сохранение...' : 'Сменить пароль'}
                    </button>
                </div>
            </form>
        </div>
    );
}
