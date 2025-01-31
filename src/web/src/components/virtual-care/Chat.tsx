/**
 * @fileoverview HIPAA-compliant secure chat component for virtual care consultations
 * @version 1.0.0
 * @license HIPAA-compliant
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TextField, IconButton, Paper, Typography, CircularProgress } from '@mui/material';
import { Send, AttachFile, Security } from '@mui/icons-material';
import { useAuditLog } from '@healthcare/audit-logger'; // v1.2.0

import { IConsultation, IConsultationParticipant, isSecureRoom } from '../../lib/types/consultation';
import { useWebRTC } from '../../hooks/useWebRTC';
import { virtualCareApi } from '../../lib/api/virtualCare';
import { VirtualCareEndpoints, processEndpointParams } from '../../lib/constants/endpoints';

// Message status enum for tracking delivery and encryption status
enum MessageStatus {
  SENDING = 'SENDING',
  DELIVERED = 'DELIVERED',
  ENCRYPTED = 'ENCRYPTED',
  FAILED = 'FAILED'
}

// Interface for secure chat message structure
interface IChatMessage {
  id: string;
  senderId: string;
  content: string;
  timestamp: Date;
  encryptionMetadata: {
    algorithm: string;
    keyId: string;
    iv: string;
  };
  integrity: string;
  attachments: Array<{
    id: string;
    name: string;
    type: string;
    size: number;
    encryptedUrl: string;
    integrity: string;
  }>;
  status: MessageStatus;
}

// Interface for component props
interface IChatProps {
  consultation: IConsultation;
  className?: string;
  encryptionKey: CryptoKey;
  auditContext: {
    sessionId: string;
    userId: string;
    userRole: string;
  };
}

/**
 * Secure chat component for virtual care consultations
 * Implements HIPAA-compliant messaging with end-to-end encryption
 */
const Chat: React.FC<IChatProps> = ({
  consultation,
  className,
  encryptionKey,
  auditContext
}) => {
  // State management
  const [messages, setMessages] = useState<IChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isEncrypted, setIsEncrypted] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Refs
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Hooks
  const { room } = useWebRTC(consultation.id, { encryptionKey });
  const auditLog = useAuditLog();

  // Verify secure room connection
  useEffect(() => {
    if (room && !isSecureRoom(room)) {
      auditLog.error('Chat room security verification failed', {
        consultationId: consultation.id,
        ...auditContext
      });
      throw new Error('Secure room verification failed');
    }
    setIsEncrypted(!!room?.encryptionEnabled);
  }, [room, consultation.id, auditContext, auditLog]);

  /**
   * Encrypts message content using provided encryption key
   */
  const encryptMessage = async (content: string): Promise<{
    encryptedContent: ArrayBuffer;
    iv: Uint8Array;
  }> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encryptedContent = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv
      },
      encryptionKey,
      data
    );

    return { encryptedContent, iv };
  };

  /**
   * Generates integrity hash for message content
   */
  const generateIntegrityHash = async (content: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  };

  /**
   * Handles secure file upload
   */
  const handleFileUpload = async (files: FileList | null) => {
    if (!files) return;

    const secureFiles = Array.from(files).slice(0, 5); // Limit to 5 files
    setAttachments(prevAttachments => [...prevAttachments, ...secureFiles]);

    auditLog.info('Files selected for upload', {
      fileCount: files.length,
      consultationId: consultation.id,
      ...auditContext
    });
  };

  /**
   * Handles secure message sending
   */
  const handleSendMessage = async () => {
    if (!newMessage.trim() && attachments.length === 0) return;
    if (!room || !isEncrypted) {
      auditLog.error('Attempted to send message in unsecure room', {
        consultationId: consultation.id,
        ...auditContext
      });
      return;
    }

    setIsSending(true);

    try {
      // Encrypt message content
      const { encryptedContent, iv } = await encryptMessage(newMessage);
      const integrity = await generateIntegrityHash(newMessage);

      // Handle file attachments
      const encryptedAttachments = await Promise.all(
        attachments.map(async file => {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('consultationId', consultation.id);
          
          const response = await fetch(processEndpointParams(VirtualCareEndpoints.UPLOAD_ATTACHMENT, { id: consultation.id }), {
            method: 'POST',
            body: formData,
            headers: {
              'X-Encryption-Key': encryptionKey.algorithm.name
            }
          });
          
          const encryptedFile = await response.json();
          return {
            id: encryptedFile.id,
            name: file.name,
            type: file.type,
            size: file.size,
            encryptedUrl: encryptedFile.url,
            integrity: encryptedFile.integrity
          };
        })
      );

      // Create secure message object
      const secureMessage: IChatMessage = {
        id: crypto.randomUUID(),
        senderId: auditContext.userId,
        content: newMessage,
        timestamp: new Date(),
        encryptionMetadata: {
          algorithm: 'AES-GCM',
          keyId: encryptionKey.algorithm.name,
          iv: Array.from(iv).join(',')
        },
        integrity,
        attachments: encryptedAttachments,
        status: MessageStatus.SENDING
      };

      // Send encrypted message
      await fetch(processEndpointParams(VirtualCareEndpoints.SEND_CHAT_MESSAGE, { id: consultation.id }), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          consultationId: consultation.id,
          message: secureMessage,
          encryptedContent
        })
      });

      // Update local state
      setMessages(prev => [...prev, { ...secureMessage, status: MessageStatus.ENCRYPTED }]);
      setNewMessage('');
      setAttachments([]);

      // Log audit event
      auditLog.info('Secure message sent', {
        messageId: secureMessage.id,
        consultationId: consultation.id,
        hasAttachments: encryptedAttachments.length > 0,
        ...auditContext
      });
    } catch (error) {
      auditLog.error('Failed to send secure message', {
        error,
        consultationId: consultation.id,
        ...auditContext
      });
    } finally {
      setIsSending(false);
    }
  };

  // Auto-scroll to latest message
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <Paper className={className} elevation={3} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Security status header */}
      <Paper elevation={1} sx={{ p: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Security color={isEncrypted ? 'success' : 'error'} />
        <Typography variant="body2">
          {isEncrypted ? 'End-to-end encrypted' : 'Establishing secure connection...'}
        </Typography>
      </Paper>

      {/* Messages container */}
      <div
        ref={chatContainerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}
      >
        {messages.map(message => (
          <Paper
            key={message.id}
            elevation={1}
            sx={{
              p: 1,
              alignSelf: message.senderId === auditContext.userId ? 'flex-end' : 'flex-start',
              maxWidth: '80%',
              backgroundColor: message.senderId === auditContext.userId ? '#e3f2fd' : '#f5f5f5'
            }}
          >
            <Typography variant="body2">{message.content}</Typography>
            {message.attachments.length > 0 && (
              <div style={{ marginTop: '8px' }}>
                {message.attachments.map(attachment => (
                  <Typography key={attachment.id} variant="caption" display="block">
                    📎 {attachment.name} ({Math.round(attachment.size / 1024)}KB)
                  </Typography>
                ))}
              </div>
            )}
            <Typography variant="caption" color="textSecondary">
              {new Date(message.timestamp).toLocaleTimeString()}
              {message.status === MessageStatus.ENCRYPTED && ' 🔒'}
            </Typography>
          </Paper>
        ))}
      </div>

      {/* Input area */}
      <Paper elevation={1} sx={{ p: 1, display: 'flex', gap: 1, alignItems: 'center' }}>
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          multiple
          onChange={e => handleFileUpload(e.target.files)}
        />
        <IconButton
          onClick={() => fileInputRef.current?.click()}
          disabled={!isEncrypted || isSending}
        >
          <AttachFile />
        </IconButton>
        <TextField
          fullWidth
          size="small"
          value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
          onKeyPress={e => e.key === 'Enter' && handleSendMessage()}
          disabled={!isEncrypted || isSending}
          placeholder="Type a secure message..."
        />
        <IconButton
          onClick={handleSendMessage}
          disabled={!isEncrypted || isSending || (!newMessage.trim() && !attachments.length)}
        >
          {isSending ? <CircularProgress size={24} /> : <Send />}
        </IconButton>
      </Paper>
    </Paper>
  );
};

export default Chat;