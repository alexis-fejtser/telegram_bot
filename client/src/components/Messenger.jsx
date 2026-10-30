import React, { useEffect, useState } from 'react';
import { Send, MessageSquare, User, CheckCircle2, Clock } from 'lucide-react';

export default function Messenger() {
    const [questions, setQuestions] = useState([]);
    const [selectedQ, setSelectedQ] = useState(null);
    const [answerText, setAnswerText] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [isUserBlocked, setIsUserBlocked] = useState(false);
    const [userInfo, setUserInfo] = useState(null);

    useEffect(() => {
        fetchQuestions();
    }, []);

    useEffect(() => {
        if (!selectedQ) return;

        fetch(`/api/analytics/users/${selectedQ.telegramId}`)
            .then((res) => (res.ok ? res.json() : null))
            .then((user) => {
                setUserInfo(user);
                setIsUserBlocked(user?.status === 'blocked');
            })
            .catch(() => {
                setUserInfo(null);
                setIsUserBlocked(false);
            });
    }, [selectedQ]);

    const fetchQuestions = () => {
        fetch('/api/questions')
            .then((res) => res.json())
            .then((data) => {
                setQuestions(data);
                if (data.length > 0 && !selectedQ) {
                    setSelectedQ(data[0]);
                }
                setLoading(false);
            })
            .catch((err) => console.error(err));
    };

    const handleSendAnswer = async (e) => {
        e.preventDefault();
        if (!selectedQ || !answerText.trim()) return;

        const qId = selectedQ.id || selectedQ._id;
        setSending(true);
        try {
            const res = await fetch(`/api/questions/${qId}/answer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ answerText }),
            });
            const data = await res.json();
            if (data.success) {
                setAnswerText('');
                fetchQuestions();
                // update selectedQ status locally
                setSelectedQ({ ...selectedQ, status: 'answered', answerText });
                if (data.warning) {
                    alert(data.warning);
                }
            } else {
                alert(data.error || 'Ошибка отправки ответа');
            }
        } catch (err) {
            alert('Ошибка сервера');
        } finally {
            setSending(false);
        }
    };

    if (loading) return <div className="p-6 text-gray-500">Загрузка мессенджера...</div>;

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-gray-800">Вопросы и Мессенджер</h1>

            <div className="grid grid-cols-1 md:grid-cols-3 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-[70vh]">
                {/* Left Column: Questions List */}
                <div className="border-r border-gray-200 overflow-y-auto">
                    <div className="p-4 border-b bg-gray-50 font-semibold text-sm text-gray-700">
                        Обращения пользователей ({questions.length})
                    </div>
                    <div className="divide-y divide-gray-100">
                        {questions.map((q) => {
                            const qId = q.id || q._id;
                            const isSelected = selectedQ && (selectedQ.id === q.id || selectedQ._id === q._id);
                            return (
                                <div
                                    key={qId}
                                    onClick={() => setSelectedQ(q)}
                                    className={`p-4 cursor-pointer transition ${
                                        isSelected ? 'bg-blue-50/60 border-l-4 border-blue-600' : 'hover:bg-gray-50'
                                    }`}
                                >
                                <div className="flex justify-between items-center mb-1">
                                    <span className="font-mono text-xs text-gray-500">ID: {q.telegramId}</span>
                                    {q.status === 'pending' ? (
                                        <span className="flex items-center gap-1 text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full font-medium">
                                            <Clock className="w-3 h-3" /> Ожидает
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full font-medium">
                                            <CheckCircle2 className="w-3 h-3" /> Отвечено
                                        </span>
                                    )}
                                </div>
                                <p className="text-sm font-medium text-gray-900 truncate">{q.questionText}</p>
                                <span className="text-xs text-gray-400 mt-1 block">
                                    {new Date(q.createdAt).toLocaleString()}
                                </span>
                            </div>
                            );
                        })}
                    </div>
                </div>

                {/* Right Column: Chat Dialog */}
                <div className="md:col-span-2 flex flex-col justify-between bg-gray-50/50">
                    {selectedQ ? (
                        <>
                            {/* Chat Header */}
                            <div className="p-4 bg-white border-b border-gray-200 flex justify-between items-center">
                                <div>
                                    <h3 className="font-semibold text-gray-900">
                                        {userInfo
                                            ? `${userInfo.firstName || 'Пользователь'} ${userInfo.lastName || ''} ${userInfo.username ? `(@${userInfo.username})` : ''}`.trim()
                                            : `Пользователь: ${selectedQ.telegramId}`}
                                    </h3>
                                    <p className="text-xs text-gray-400">
                                        Telegram ID: {selectedQ.telegramId} · Создано: {new Date(selectedQ.createdAt).toLocaleString()}
                                    </p>
                                </div>
                                <span className={`text-xs px-3 py-1 rounded-full font-medium ${selectedQ.status === 'pending' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                                    {selectedQ.status === 'pending' ? 'Требует ответа' : 'Диалог завершен'}
                                </span>
                            </div>

                            {/* Chat Messages */}
                            <div className="p-6 overflow-y-auto space-y-4 flex-1">
                                <div className="flex flex-col items-start">
                                    <div className="max-w-md bg-white p-4 rounded-2xl rounded-tl-xs shadow-xs border border-gray-200 text-sm text-gray-800">
                                        <p className="font-semibold text-xs text-blue-600 mb-1">Вопрос пользователя:</p>
                                        {selectedQ.questionText}
                                    </div>
                                    <span className="text-[10px] text-gray-400 mt-1 ml-1">{new Date(selectedQ.createdAt).toLocaleTimeString()}</span>
                                </div>

                                {selectedQ.answerText && (
                                    <div className="flex flex-col items-end">
                                        <div className="max-w-md bg-blue-600 text-white p-4 rounded-2xl rounded-tr-xs shadow-xs text-sm">
                                            <p className="font-semibold text-xs text-blue-200 mb-1">Ответ менеджера:</p>
                                            {selectedQ.answerText}
                                        </div>
                                        <span className="text-[10px] text-gray-400 mt-1 mr-1">
                                            {selectedQ.answeredAt ? new Date(selectedQ.answeredAt).toLocaleTimeString() : ''}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Reply Form */}
                            {isUserBlocked ? (
                                <div className="p-4 bg-red-50 border-t border-red-100 text-red-700 text-sm text-center font-medium">
                                    Пользователь заблокировал бота. Отправка сообщений невозможна.
                                </div>
                            ) : (
                                <form onSubmit={handleSendAnswer} className="p-4 bg-white border-t border-gray-200 flex gap-3">
                                    <input
                                        type="text"
                                        placeholder="Введите ответ пользователю..."
                                        value={answerText}
                                        onChange={(e) => setAnswerText(e.target.value)}
                                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        required
                                    />
                                    <button
                                        type="submit"
                                        disabled={sending}
                                        className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
                                    >
                                        <Send className="w-4 h-4" />
                                        {sending ? 'Отправка...' : 'Отправить'}
                                    </button>
                                </form>
                            )}
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-gray-400">
                            Выберите вопрос из списка слева
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
