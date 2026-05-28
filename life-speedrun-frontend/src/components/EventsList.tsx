// src/components/EventsList.tsx - Компонент списка событий с фильтрацией, поиском, сортировкой и пагинацией
import React, { useState, useEffect } from 'react';
import { api, Event, PaginatedEvents, EventsQueryParams, FileInfo, FileUploadResponse } from '../api';
import { Search, Filter, ChevronLeft, ChevronRight, Upload, Download, Trash2, X, File as FileIcon } from 'lucide-react';

interface EventsListProps {
  token: string;
  selectedDate: Date;
  onEventSelect?: (event: Event) => void;
}

interface FilterState {
  search: string;
  completed: string; // "all", "true", "false"
  color: string;
  date_from: string;
  date_to: string;
}

const EventsList: React.FC<EventsListProps> = ({ token, selectedDate, onEventSelect }) => {
  const [data, setData] = useState<PaginatedEvents | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Фильтры
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    completed: 'all',
    color: '',
    date_from: '',
    date_to: ''
  });
  
  // Сортировка
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // Пагинация
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  
  // Файлы
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showFileModal, setShowFileModal] = useState(false);

  // Загрузка событий
  const loadEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: EventsQueryParams = {
        page,
        page_size: pageSize,
        sort_by: sortBy,
        sort_order: sortOrder
      };
      
      if (filters.search) params.search = filters.search;
      if (filters.completed !== 'all') {
        params.completed = filters.completed === 'true';
      }
      if (filters.color) params.color = filters.color;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;
      
      const result = await api.getEvents(token, params);
      setData(result);
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки событий');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, [page, pageSize, sortBy, sortOrder]);

  // Применение фильтров (сброс на страницу 1)
  const applyFilters = () => {
    setPage(1);
    loadEvents();
  };

  // Сброс фильтров
  const resetFilters = () => {
    setFilters({
      search: '',
      completed: 'all',
      color: '',
      date_from: '',
      date_to: ''
    });
    setPage(1);
  };

  // Загрузка файлов для события
  const loadFiles = async (eventId: number) => {
    try {
      const eventFiles = await api.getEventFiles(token, eventId);
      setFiles(eventFiles);
    } catch (err: any) {
      console.error('Ошибка загрузки файлов:', err);
    }
  };

  // Открытие модального окна файлов
  const openFileModal = (eventId: number) => {
    setSelectedEventId(eventId);
    loadFiles(eventId);
    setShowFileModal(true);
  };

  // Загрузка файла
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedEventId || !e.target.files?.length) return;
    
    const file = e.target.files[0];
    setUploading(true);
    try {
      await api.uploadFile(token, selectedEventId, file);
      await loadFiles(selectedEventId);
    } catch (err: any) {
      alert(`Ошибка загрузки: ${err.message}`);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  // Удаление файла
  const handleDeleteFile = async (fileId: number) => {
    if (!selectedEventId) return;
    if (!confirm('Удалить файл?')) return;
    
    try {
      await api.deleteFile(token, selectedEventId, fileId);
      await loadFiles(selectedEventId);
    } catch (err: any) {
      alert(`Ошибка удаления: ${err.message}`);
    }
  };

  // Скачивание файла
  const handleDownloadFile = async (file: FileInfo) => {
    try {
      // В реальном приложении здесь нужно получить presigned URL
      // Для демо просто покажем сообщение
      alert(`Скачивание файла: ${file.file_name}`);
    } catch (err: any) {
      alert(`Ошибка скачивания: ${err.message}`);
    }
  };

  // Форматирование размера файла
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const colorOptions = [
    { name: 'Все', value: '' },
    { name: 'Синий', value: '#3B82F6' },
    { name: 'Зеленый', value: '#10B981' },
    { name: 'Фиолетовый', value: '#8B5CF6' },
    { name: 'Оранжевый', value: '#F59E0B' },
    { name: 'Красный', value: '#EF4444' },
    { name: 'Розовый', value: '#EC4899' }
  ];

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      {/* Панель фильтров */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-5 h-5 text-gray-600" />
          <h3 className="font-semibold text-gray-700">Фильтры</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Поиск */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Поиск по названию..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              onKeyPress={(e) => e.key === 'Enter' && applyFilters()}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          {/* Статус выполнения */}
          <select
            value={filters.completed}
            onChange={(e) => setFilters({ ...filters, completed: e.target.value })}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Все статусы</option>
            <option value="true">Выполнено</option>
            <option value="false">Не выполнено</option>
          </select>
          
          {/* Цвет */}
          <select
            value={filters.color}
            onChange={(e) => setFilters({ ...filters, color: e.target.value })}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            {colorOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.name}</option>
            ))}
          </select>
          
          {/* Дата от */}
          <input
            type="date"
            value={filters.date_from}
            onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="Дата от"
          />
          
          {/* Дата до */}
          <input
            type="date"
            value={filters.date_to}
            onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="Дата до"
          />
          
          {/* Кнопки */}
          <div className="flex gap-2">
            <button
              onClick={applyFilters}
              className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
            >
              Применить
            </button>
            <button
              onClick={resetFilters}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
            >
              Сброс
            </button>
          </div>
        </div>
        
        {/* Сортировка */}
        <div className="mt-4 flex items-center gap-4">
          <span className="text-sm text-gray-600">Сортировка:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
          >
            <option value="created_at">По дате создания</option>
            <option value="date">По дате события</option>
            <option value="title">По названию</option>
            <option value="completed">По статусу</option>
          </select>
          
          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="px-3 py-1.5 bg-gray-100 rounded-lg text-sm hover:bg-gray-200"
          >
            {sortOrder === 'asc' ? '↑ По возрастанию' : '↓ По убыванию'}
          </button>
        </div>
      </div>

      {/* Список событий */}
      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-2 text-gray-600">Загрузка...</p>
        </div>
      ) : error ? (
        <div className="text-center py-8 text-red-500">{error}</div>
      ) : data && data.items.length === 0 ? (
        <div className="text-center py-8 text-gray-500">События не найдены</div>
      ) : data ? (
        <>
          <div className="space-y-3">
            {data.items.map((event) => (
              <div
                key={event.id}
                className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition cursor-pointer"
                style={{ borderLeft: `4px solid ${event.color}` }}
                onClick={() => onEventSelect?.(event)}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-800">{event.title}</h4>
                    <p className="text-sm text-gray-600 mt-1">
                      {event.date} | {event.startTime} - {event.endTime}
                    </p>
                    {event.description && (
                      <p className="text-sm text-gray-500 mt-2">{event.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      {event.completed && (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">
                          Выполнено
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openFileModal(event.id);
                        }}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                      >
                        <FileIcon className="w-3 h-3" />
                        Файлы
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Пагинация */}
          {data.total_pages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Страница {data.page} из {data.total_pages} ({data.total} событий)
              </div>
              
              <div className="flex items-center gap-2">
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                >
                  <option value={5}>5 на стр.</option>
                  <option value={10}>10 на стр.</option>
                  <option value={20}>20 на стр.</option>
                  <option value={50}>50 на стр.</option>
                </select>
                
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                
                <button
                  onClick={() => setPage(p => Math.min(data.total_pages, p + 1))}
                  disabled={page === data.total_pages}
                  className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </>
      ) : null}

      {/* Модальное окно файлов */}
      {showFileModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 m-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Файлы события</h3>
              <button
                onClick={() => setShowFileModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Загрузка файла */}
            <div className="mb-4">
              <label className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 transition">
                <Upload className="w-5 h-5 text-gray-400" />
                <span className="text-sm text-gray-600">
                  {uploading ? 'Загрузка...' : 'Выберите файл для загрузки'}
                </span>
                <input
                  type="file"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  className="hidden"
                  accept="image/*,.pdf,.txt,.json"
                />
              </label>
              <p className="text-xs text-gray-500 mt-1">
                Макс. размер: 10 MB. Типы: изображения, PDF, TXT, JSON
              </p>
            </div>
            
            {/* Список файлов */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {files.length === 0 ? (
                <p className="text-center text-gray-500 py-4">Нет файлов</p>
              ) : (
                files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <FileIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{file.file_name}</p>
                        <p className="text-xs text-gray-500">{formatFileSize(file.file_size)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDownloadFile(file)}
                        className="p-2 hover:bg-gray-200 rounded-lg"
                        title="Скачать"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteFile(file.id)}
                        className="p-2 hover:bg-red-100 text-red-500 rounded-lg"
                        title="Удалить"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EventsList;
