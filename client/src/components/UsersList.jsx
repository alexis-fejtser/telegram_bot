import React, { useEffect, useState } from 'react';
import { Search, Clock, X, ChevronLeft, ChevronRight, Filter } from 'lucide-react';

const ACTION_LABELS = {
    bot_start: { label: 'Запуск бота', icon: '🚀' },
    deeplink_start: { label: 'Переход по ссылке', icon: '🔗' },
    menu_opened: { label: 'Открыл главное меню', icon: '🏠' },
    scene_enter: { label: 'Вход в сцену', icon: '📂' },
    step_render: { label: 'Показ шага', icon: '📄' },
    step_advance: { label: 'Переход к следующему шагу', icon: '➡️' },
    question_flow_started: { label: 'Начал задавать вопрос', icon: '❓' },
    question_submitted: { label: 'Отправил вопрос', icon: '💬' },
    consultation_requested: { label: 'Запросил консультацию', icon: '📞' },
    bot_blocked: { label: 'Заблокировал бота', icon: '🚫' },
    bot_unblocked: { label: 'Разблокировал бота', icon: '✅' },
    message_sent: { label: 'Отправлено сообщение', icon: '✉️' },
};

const DETAIL_LABELS = {
    sceneId: 'Сцена',
    stepIndex: 'Шаг',
    questionText: 'Текст вопроса',
    payload: 'Параметр ссылки',
    reason: 'Причина',
    action: 'Действие',
};

const formatDateTime = (value) => {
    if (!value) return '—';
    return new Date(value).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const PAGE_SIZE = 20;

export default function UsersList() {
    const [users, setUsers] = useState([]);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [sceneFilter, setSceneFilter] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [scenes, setScenes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState(null);
    const [history, setHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    useEffect(() => {
        fetch('/api/scenes')
            .then((res) => res.json())
            .then((data) => setScenes(Array.isArray(data) ? data : []))
            .catch((err) => console.error(err));
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search.trim());
            setPage(1);
        }, 300);
        return () => clearTimeout(timer);
    }, [search]);

    useEffect(() => {
        fetchUsers();
    }, [debouncedSearch, sceneFilter, page]);

    const fetchUsers = () => {
        setLoading(true);
        const params = new URLSearchParams();
        if (debouncedSearch) params.set('search', debouncedSearch);
        if (sceneFilter) params.set('scene', sceneFilter);
        params.set('page', String(page));
        params.set('limit', String(PAGE_SIZE));

        fetch(`/api/analytics/users?${params.toString()}`)
            .then((res) => res.json())
            .then((data) => {
                setUsers(data.users || []);
                setTotal(data.total || 0);
                setTotalPages(data.totalPages || 1);
                setLoading(false);
            })
            .catch((err) => {
                console.error(err);
                setUsers([]);
                setLoading(false);
            });
    };

    const openUserHistory = async (user) => {
        setSelectedUser(user);
        setHistoryLoading(true);
        try {
            const res = await fetch(`/api/analytics/users/${user.telegramId}/history`);
            const data = await res.json();
            setHistory(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error(err);
            setHistory([]);
        } finally {
            setHistoryLoading(false);
        }
    };

    const resolveSceneTitle = (sceneId) => {
        if (!sceneId) return 'Главное меню';
        const scene = scenes.find((s) => s.sceneId === sceneId);
        return scene ? scene.title : sceneId;
    };

    const renderHistoryDetails = (item) => {
        const details = item.details || {};
        const entries = Object.entries(details).filter(([, value]) => value !== null && value !== undefined && value !== '');
        const known = [];
        const unknown = [];

        for (const [key, value] of entries) {
            if (DETAIL_LABELS[key]) {
                known.push([key, value]);
            } else {
                unknown.push([key, value]);
            }
        }

        return (
            <div className="space-y-1.5 mt-2">
                {known.map(([key, value]) => {
                    let displayValue = String(value);
                    if (key === 'sceneId') displayValue = resolveSceneTitle(value);
                    if (key === 'stepIndex') displayValue = `№${Number(value) + 1}`;
                    return (
                        <div key={key} className="text-xs text-gray-600">
                            <span className="text-gray-400">{DETAIL_LABELS[key]}:</span>{' '}
                            <span className="font-medium break-words">{displayValue}</span>
                        </div>
                    );
                })}

                {known.length === 0 && unknown.length === 0 && (
                    <div className="text-xs text-gray-400 italic">Нет дополнительных данных</div>
                )}

                {unknown.length > 0 && (
                    <details className="text-xs text-gray-500">
                        <summary className="cursor-pointer text-gray-400 hover:text-gray-600">
                            Технические данные
                        </summary>
                        <pre className="text-[10px] text-gray-600 bg-white p-2 rounded border border-gray-200 overflow-x-auto mt-1">
                            {JSON.stringify(Object.fromEntries(unknown), null, 2)}
                        </pre>
                    </details>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap justify-between items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-800">Пользователи бота</h1>
                <div className="flex items-center gap-2">
                    <div className="relative w-72">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Имя, username, Telegram ID или сцена..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div className="relative">
                        <Filter className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                        <select
                            value={sceneFilter}
                            onChange={(e) => {
                                setSceneFilter(e.target.value);
                                setPage(1);
                            }}
                            className="pl-9 pr-8 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">Все сцены</option>
                            <option value="__main_menu__">Главное меню</option>
                            {scenes.map((scene) => (
                                <option key={scene.sceneId} value={scene.sceneId}>
                                    {scene.title}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Users Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                <th className="px-6 py-3">Пользователь</th>
                                <th className="px-6 py-3">Telegram ID</th>
                                <th className="px-6 py-3">Телефон</th>
                                <th className="px-6 py-3">Текущая сцена</th>
                                <th className="px-6 py-3">Статус</th>
                                <th className="px-6 py-3">Последняя активность</th>
                                <th className="px-6 py-3 text-right">Действия</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 text-sm text-gray-700">
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-8 text-center text-gray-400">
                                        Загрузка пользователей...
                                    </td>
                                </tr>
                            ) : users.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-8 text-center text-gray-400">
                                        Пользователи не найдены
                                    </td>
                                </tr>
                            ) : (
                                users.map((u) => (
                                    <tr key={u.telegramId} className="hover:bg-gray-50 transition">
                                        <td className="px-6 py-4 flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                                                {u.firstName?.[0] || 'U'}
                                            </div>
                                            <div>
                                                <div className="font-medium text-gray-900">{u.firstName} {u.lastName || ''}</div>
                                                <div className="text-xs text-gray-400">{u.username ? `@${u.username}` : 'нет username'}</div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 font-mono text-xs text-gray-600">{u.telegramId}</td>
                                        <td className="px-6 py-4">{u.phone || 'Не указан'}</td>
                                        <td className="px-6 py-4">
                                            <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                                                {resolveSceneTitle(u.currentScene)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${u.status === 'blocked' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                                {u.status === 'blocked' ? 'Заблокирован' : 'Активен'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-gray-500 text-xs">
                                            {formatDateTime(u.lastInteractionAt)}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => openUserHistory(u)}
                                                className="px-3 py-1.5 bg-gray-100 hover:bg-blue-600 hover:text-white text-gray-700 rounded-lg text-xs font-medium transition"
                                            >
                                                История
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-gray-50 text-sm text-gray-600">
                    <span>Всего пользователей: <strong>{total}</strong></span>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page <= 1}
                            className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
                            title="Предыдущая страница"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-xs">
                            Страница {page} из {totalPages}
                        </span>
                        <button
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            disabled={page >= totalPages}
                            className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
                            title="Следующая страница"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* History Modal */}
            {selectedUser && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-gray-200">
                        <div className="p-6 border-b flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">
                                    {selectedUser.firstName} {selectedUser.lastName || ''} ({selectedUser.telegramId})
                                </h3>
                                <p className="text-xs text-gray-500">История действий и событий внутри бота</p>
                            </div>
                            <button onClick={() => setSelectedUser(null)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto space-y-4 flex-1">
                            {historyLoading ? (
                                <p className="text-center text-gray-400 py-8">Загрузка истории...</p>
                            ) : history.length === 0 ? (
                                <p className="text-center text-gray-400 py-8">История пуста</p>
                            ) : (
                                history.map((item, idx) => {
                                    const meta = ACTION_LABELS[item.actionType] || {
                                        label: item.actionType,
                                        icon: '•',
                                    };
                                    return (
                                        <div key={idx} className="flex gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
                                            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg h-fit text-base leading-none">
                                                {meta.icon}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-center gap-2">
                                                    <span className="font-semibold text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                                                        {meta.label}
                                                    </span>
                                                    <span className="text-xs text-gray-400 flex items-center gap-1 shrink-0">
                                                        <Clock className="w-3 h-3" />
                                                        {formatDateTime(item.timestamp)}
                                                    </span>
                                                </div>
                                                {renderHistoryDetails(item)}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
