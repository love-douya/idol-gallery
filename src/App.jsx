import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// 替换为你自己的 Supabase 配置
const supabaseUrl = 'https://hppsjmveutqmdsuvgrvb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwcHNqbXZldXRxbWRzdXZncnZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEzMDYzNDksImV4cCI6MjA2Njg4MjM0OX0.-tl4hkGnALnLT0UlT7B1ImzMoiM17OFJYHzECKrR8zM';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const App = () => {
  const [dates, setDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [photos, setPhotos] = useState({});
  const [likes, setLikes] = useState({});

  // 加载所有日期
  useEffect(() => {
    const fetchDates = async () => {
      const { data, error } = await supabase.from('dates').select('id');
      if (data) {
        setDates(data.map(d => d.id));
      }
    };
    fetchDates();

    const channel = supabase.channel('dates-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dates' },
        payload => {
          setDates(prev => [...prev, payload.new.id]);
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'dates' },
        payload => {
          setDates(prev => prev.filter(d => d !== payload.old.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 加载照片和点赞状态
  useEffect(() => {
    if (!selectedDate) return;

    const fetchPhotos = async () => {
      const { data, error } = await supabase
        .from('photos')
        .select('*')
        .eq('date_id', selectedDate);

      if (data) {
        setPhotos(prev => ({ ...prev, [selectedDate]: data }));
        const likeMap = {};
        data.forEach(p => {
          likeMap[`${selectedDate}-${p.id}`] = p.likes > 0;
        });
        setLikes(likeMap);
      }
    };

    fetchPhotos();

    const channel = supabase.channel(`photos-${selectedDate}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'photos', filter: `date_id=eq.${selectedDate}` },
        payload => {
          setPhotos(prev => {
            const list = prev[selectedDate].map(p =>
              p.id === payload.new.id ? payload.new : p
            );
            return { ...prev, [selectedDate]: list };
          });

          setLikes(prev => ({
            ...prev,
            [`${selectedDate}-${payload.new.id}`]: payload.new.likes > 0
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedDate]);

  const addDate = async () => {
    const newDate = prompt('请输入新日期 (格式: YYYY-MM-DD)');
    if (newDate && !dates.includes(newDate)) {
      const { error } = await supabase.from('dates').insert({ id: newDate });
      if (!error) setDates([...dates, newDate]);
    }
  };

  const deleteDate = async (date) => {
    if (window.confirm(`确定要删除日期 ${date} 及其所有照片吗？`)) {
      await supabase.from('dates').delete().eq('id', date);
      await supabase.from('photos').delete().eq('date_id', date);
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !selectedDate) return;

    const filePath = `${selectedDate}/${Date.now()}`;
    const { error: uploadError } = await supabase.storage
      .from('photos')
      .upload(filePath, file);

    if (uploadError) {
      alert('上传失败');
      return;
    }

    const { publicURL } = supabase.storage.from('photos').getPublicUrl(filePath).data;

    await supabase.from('photos').insert({
      date_id: selectedDate,
      url: publicURL
    });
  };

  const deletePhoto = async (photoId) => {
    if (window.confirm('确定要删除这张照片吗？')) {
      await supabase.from('photos').delete().eq('id', photoId);
    }
  };

  const toggleLike = async (photoId) => {
    const key = `${selectedDate}-${photoId}`;
    const current = likes[key];

    const { data } = await supabase
      .from('photos')
      .select('likes')
      .eq('id', photoId)
      .single();

    await supabase
      .from('photos')
      .update({ likes: current ? data.likes - 1 : data.likes + 1 })
      .eq('id', photoId);

    setLikes(prev => ({ ...prev, [key]: !current }));
  };

  const selectedPhotos = photos[selectedDate] || [];

  return (
    <div className="flex flex-col md:flex-row h-screen bg-gray-100 p-2">
      {/* Left Panel */}
      <div className="w-full md:w-1/4 bg-white shadow-md p-4 overflow-y-auto rounded mb-4 md:mb-0 md:mr-2">
        <h2 className="text-xl font-bold mb-4">日期列表</h2>
        <button
          onClick={addDate}
          className="mb-4 w-full py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          + 添加日期
        </button>
        <ul>
          {dates.map(date => (
            <li key={date} className="mb-2 flex justify-between items-center">
              <span
                onClick={() => setSelectedDate(date)}
                className={`cursor-pointer ${selectedDate === date ? 'font-bold' : ''}`}
              >
                {date}
              </span>
              <button
                onClick={() => deleteDate(date)}
                className="text-xs text-red-500"
              >
                ❌
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Gallery */}
      <div className="w-full md:w-3/4 p-4 bg-white rounded shadow overflow-y-auto md:ml-2">
        {selectedDate ? (
          <>
            <h2 className="text-2xl font-bold mb-4">{selectedDate} 的画廊</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {selectedPhotos.length > 0 ? (
                selectedPhotos.map(photo => (
                  <div key={photo.id} className="bg-white rounded shadow overflow-hidden relative">
                    <img src={photo.url} alt="偶像" className="w-full object-cover h-48" />
                    <div className="p-2 flex justify-between items-center">
                      <span>{photo.likes}</span>
                      <button
                        onClick={() => toggleLike(photo.id)}
                        className={`text-xl focus:outline-none ${
                          likes[`${selectedDate}-${photo.id}`]
                            ? 'text-red-500'
                            : 'text-gray-300'
                        }`}
                      >
                        ❤️
                      </button>
                    </div>
                    <button
                      onClick={() => deletePhoto(photo.id)}
                      className="absolute top-1 right-1 text-sm text-red-500 bg-black bg-opacity-30 rounded px-1"
                    >
                      ❌
                    </button>
                  </div>
                ))
              ) : (
                <p>暂无照片</p>
              )}
            </div>
            <div className="mt-4">
              <label className="cursor-pointer inline-block bg-green-500 text-white py-2 px-4 rounded hover:bg-green-600">
                上传照片
                <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
              </label>
            </div>
          </>
        ) : (
          <p className="text-gray-500">请选择一个日期查看画廊</p>
        )}
      </div>
    </div>
  );
};

export default App;