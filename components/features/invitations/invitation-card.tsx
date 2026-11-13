"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Invitation } from "@/lib/invitation-data";
import Image from "next/image";
import { Clock, Sparkles, Check, X, HelpCircle } from "lucide-react";
import { useState } from "react";
import { useRelationship } from "@/contexts/relationship-context";
import {
  generateAcceptResponse,
  generateDeclineResponse,
  generateMaybeResponse,
} from "@/lib/ai-response";
import { useRouter } from "next/navigation";

interface InvitationCardProps {
  invitation: Invitation;
  onRespond?: (
    invitationId: string,
    response: "accepted" | "declined" | "maybe",
    message?: string
  ) => void;
}

export function InvitationCard({
  invitation,
  onRespond,
}: InvitationCardProps) {
  const router = useRouter();
  const { getRelationship } = useRelationship();
  const [showAIResponse, setShowAIResponse] = useState(false);
  const [aiMessage, setAiMessage] = useState("");
  const [selectedResponse, setSelectedResponse] = useState<
    "accepted" | "declined" | "maybe" | null
  >(null);

  const relationshipLevel = getRelationship(invitation.organizerId);

  const handleQuickResponse = (response: "accepted" | "declined" | "maybe") => {
    setSelectedResponse(response);
    onRespond?.(invitation.id, response);
  };

  const handleAIGenerate = (responseType: "accepted" | "declined" | "maybe") => {
    let message = "";
    switch (responseType) {
      case "accepted":
        message = generateAcceptResponse(
          relationshipLevel,
          invitation.eventTitle,
          invitation.organizerName
        );
        break;
      case "declined":
        message = generateDeclineResponse(
          relationshipLevel,
          invitation.organizerName
        );
        break;
      case "maybe":
        message = generateMaybeResponse(
          relationshipLevel,
          invitation.eventTitle
        );
        break;
    }
    setAiMessage(message);
    setShowAIResponse(true);
  };

  const handleSendAIResponse = () => {
    if (selectedResponse) {
      onRespond?.(invitation.id, selectedResponse, aiMessage);
      setShowAIResponse(false);
    }
  };

  const timeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}日前`;
    if (hours > 0) return `${hours}時間前`;
    return "たった今";
  };

  if (invitation.status !== "pending") {
    return null;
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, x: -100 }}
        layout
        className="bg-white rounded-3xl shadow-lg overflow-hidden"
      >
        {/* 画像ヘッダー */}
        {invitation.eventImageUrl && (
          <div className="relative h-48 w-full overflow-hidden">
            <Image
              src={invitation.eventImageUrl}
              alt={invitation.eventTitle}
              fill
              className="object-cover"
              unoptimized
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            <div className="absolute top-4 right-4 px-3 py-1 bg-white/90 backdrop-blur-sm rounded-full text-xs font-medium text-gray-700">
              招待
            </div>
          </div>
        )}

        <div className="p-6">
          {/* 主催者情報 */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative w-12 h-12 rounded-full overflow-hidden ring-2 ring-[#FF6B6B]">
              <Image
                src={invitation.organizerAvatar}
                alt={invitation.organizerName}
                fill
                className="object-cover"
                unoptimized
              />
            </div>
            <div className="flex-1">
              <p className="font-bold text-gray-800">
                {invitation.organizerName}
              </p>
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <Clock size={12} />
                {timeAgo(invitation.invitedAt)}
              </div>
            </div>
          </div>

          {/* イベント情報 */}
          <h3
            onClick={() => router.push(`/events/${invitation.eventId}`)}
            className="text-xl font-bold text-gray-800 mb-2 cursor-pointer hover:text-[#FF6B6B] transition-colors"
          >
            {invitation.eventTitle}
          </h3>

          {invitation.message && (
            <p className="text-gray-600 text-sm mb-4 italic">
              &ldquo;{invitation.message}&rdquo;
            </p>
          )}

          {/* アクションボタン */}
          <div className="space-y-3">
            {/* クイックレスポンス */}
            <div className="grid grid-cols-3 gap-2">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleQuickResponse("accepted")}
                className="flex flex-col items-center gap-1 py-3 bg-gradient-to-br from-green-100 to-emerald-100 text-green-700 rounded-2xl font-medium shadow-md hover:shadow-lg transition-shadow"
              >
                <Check size={24} />
                <span className="text-xs">参加</span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleQuickResponse("maybe")}
                className="flex flex-col items-center gap-1 py-3 bg-gradient-to-br from-yellow-100 to-orange-100 text-yellow-700 rounded-2xl font-medium shadow-md hover:shadow-lg transition-shadow"
              >
                <HelpCircle size={24} />
                <span className="text-xs">検討中</span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleQuickResponse("declined")}
                className="flex flex-col items-center gap-1 py-3 bg-gradient-to-br from-red-100 to-pink-100 text-red-700 rounded-2xl font-medium shadow-md hover:shadow-lg transition-shadow"
              >
                <X size={24} />
                <span className="text-xs">辞退</span>
              </motion.button>
            </div>

            {/* AI返信生成ボタン */}
            <div className="grid grid-cols-3 gap-2">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setSelectedResponse("accepted");
                  handleAIGenerate("accepted");
                }}
                className="flex items-center justify-center gap-1 py-2 bg-green-50 text-green-600 rounded-xl text-xs font-medium shadow-card hover:bg-green-100 transition-colors"
              >
                <Sparkles size={14} />
                AI返信
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setSelectedResponse("maybe");
                  handleAIGenerate("maybe");
                }}
                className="flex items-center justify-center gap-1 py-2 bg-yellow-50 text-yellow-600 rounded-xl text-xs font-medium shadow-card hover:bg-yellow-100 transition-colors"
              >
                <Sparkles size={14} />
                AI返信
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setSelectedResponse("declined");
                  handleAIGenerate("declined");
                }}
                className="flex items-center justify-center gap-1 py-2 bg-red-50 text-red-600 rounded-xl text-xs font-medium shadow-card hover:bg-red-100 transition-colors"
              >
                <Sparkles size={14} />
                AI返信
              </motion.button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* AI返信モーダル */}
      <AnimatePresence>
        {showAIResponse && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowAIResponse(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6"
            >
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="text-[#FF6B6B]" size={24} />
                <h3 className="text-xl font-bold text-gray-800">AI返信</h3>
              </div>

              <p className="text-sm text-gray-600 mb-4">
                好感度レベル:{" "}
                <span className="font-bold text-[#845EF7]">
                  {relationshipLevel}
                </span>
              </p>

              <div className="mb-6">
                <textarea
                  value={aiMessage}
                  onChange={(e) => setAiMessage(e.target.value)}
                  className="w-full p-4 bg-gray-50 rounded-2xl border border-gray-200 focus:border-[#FF6B6B] focus:outline-none resize-none"
                  rows={6}
                />
              </div>

              <div className="flex gap-3">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowAIResponse(false)}
                  className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-full font-medium"
                >
                  キャンセル
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleSendAIResponse}
                  className="flex-1 py-3 bg-gradient-to-r from-[#FF6B6B] to-[#845EF7] text-white rounded-full font-medium shadow-lg"
                >
                  送信
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
