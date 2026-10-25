// src/components/common/FilePreviewModal.tsx
import React, { useState, useEffect } from 'react';

interface FilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileId: number;
  fileName: string;
  previewUrl?: string; // 🔥 NUEVA PROP: URL de la miniatura generada al subir
}

const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  isOpen,
  onClose,
  fileId,
  fileName,
  previewUrl,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !fileId) return;

    // 🔥 SI YA TENEMOS UNA URL DE MINIATURA (RÁPIDA), LA USAMOS DIRECTAMENTE
    if (previewUrl) {
      const getDriveId = (url: string) => {
        const match = url.match(/id=([^&]+)/);
        return match ? match[1] : null;
      };
      
      const driveId = getDriveId(previewUrl);
      if (driveId) {
        // Usamos el endpoint de Google Drive para miniaturas (carga en 1-2 seg)
        setImageUrl(`https://drive.google.com/thumbnail?id=${driveId}&sz=w1200`);
        setLoading(false);
        setError(null);
        return;
      }
    }

    // ⚠️ PLAN B: Si no hay miniatura (archivo viejo), usamos el backend (lento)
    setLoading(true);
    setError(null);
    setImageUrl(null);
    
    const token = localStorage.getItem('token');
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5005/api';
    
    fetch(`${baseUrl}/archivos/${fileId}/preview?size=medium`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    .then(res => {
      if (!res.ok) {
        return res.text().then(text => { 
          throw new Error(`Error ${res.status}: ${text}`);
        });
      }
      return res.blob();
    })
    .then(blob => {
      const url = URL.createObjectURL(blob);
      setImageUrl(url);
      setLoading(false);
    })
    .catch(err => {
      setError(err.message || 'Error al cargar la vista previa');
      setLoading(false);
    });

  }, [isOpen, fileId, previewUrl]);

  // Limpiar URL al cerrar
  useEffect(() => {
    return () => {
      if (imageUrl && imageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <span className="text-xl">👁️</span>
            <h3 className="text-lg font-semibold text-gray-800 truncate max-w-md">
              {fileName}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            ✕
          </button>
        </div>

        {/* Contenido */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
          {loading ? (
            <div className="flex justify-center items-center h-96">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
              <span className="ml-3 text-gray-500">Generando previsualización...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-500 text-lg">❌ {error}</p>
              <p className="text-gray-400 mt-2">No se pudo cargar la vista previa del archivo</p>
              <button
                onClick={onClose}
                className="mt-4 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
              >
                Cerrar
              </button>
            </div>
          ) : imageUrl ? (
            <div>
              <div className="flex justify-center">
                <img
                  src={imageUrl}
                  alt={fileName}
                  className="max-w-full max-h-[70vh] object-contain rounded-lg"
                  onError={() => {
                    setError('Error al renderizar la imagen. El archivo podría no ser una imagen válida.');
                  }}
                />
              </div>
              <div className="mt-4 text-center border-t border-gray-100 pt-3">
                <p className="text-xs text-gray-400">
                  ⚡ Vista previa generada automáticamente
                </p>
                <p className="text-xs text-gray-400">
                  💡 Usa el botón "Descargar" para obtener el archivo original
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-400">No se pudo cargar la vista previa</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default FilePreviewModal;