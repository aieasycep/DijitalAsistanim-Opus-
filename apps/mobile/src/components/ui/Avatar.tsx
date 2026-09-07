import { palette, radius } from '@da/design-tokens'
import { initialsOf } from '@da/i18n'
import { Image } from 'expo-image'
import { View } from 'react-native'
import { useTheme } from '../../theme/ThemeProvider'
import { Text } from './Text'

/**
 * Deterministic avatar tints. A person always gets the same colour, so the
 * feed stays visually stable between sessions without storing anything.
 */
const TINTS = [
  palette.indigo500,
  palette.green500,
  palette.amber500,
  palette.blue500,
  palette.coral500,
] as const

function tintFor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return TINTS[hash % TINTS.length] ?? palette.indigo500
}

export interface AvatarProps {
  name: string
  imageUrl?: string | null
  size?: number
  /** Draws the VIP ring. */
  isVip?: boolean
  testID?: string
}

export function Avatar({ name, imageUrl, size = 40, isVip = false, testID }: AvatarProps) {
  const theme = useTheme()
  const initials = initialsOf(name)
  const tint = tintFor(name)

  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={name}
      style={{
        width: size,
        height: size,
        borderRadius: size >= 56 ? radius.cardSm : radius.full,
        backgroundColor: imageUrl ? theme.colors.surface2 : tint,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        ...(isVip ? { borderWidth: 2, borderColor: theme.colors.warning } : {}),
      }}
    >
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          transition={120}
          accessible={false}
        />
      ) : (
        <Text
          variant={size >= 48 ? 'h3' : 'micro'}
          style={{ color: palette.white, fontSize: Math.max(11, size * 0.36) }}
        >
          {initials}
        </Text>
      )}
    </View>
  )
}
