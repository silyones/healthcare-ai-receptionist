import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import ariaAvatar from '../../star.jpg'
import React from 'react'

interface AgentAvatarProps {
  speaking: boolean
}

export const AgentAvatar: React.FC<AgentAvatarProps> = ({ speaking }) => {
  return (
    <div className="relative flex items-center justify-center w-32 h-32 sm:w-40 sm:h-40">
      {speaking && (
        <span className="absolute inset-0 rounded-full bg-accent/20 animate-vibrate-ring" />
      )}
      <Avatar
        className={`h-24 w-24 sm:h-28 sm:w-28 ring-4 ring-accent/10 transition-all duration-300 ${
          speaking ? 'animate-vibrate shadow-accent-glow' : ''
        }`}
      >
        <AvatarImage src={ariaAvatar} alt="Aria" />
        <AvatarFallback className="bg-button-dark text-white text-2xl font-bold">
          A
        </AvatarFallback>
      </Avatar>
    </div>
  )
}
