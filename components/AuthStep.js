import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../constants/theme';

const ACCESSORY_ID = 'clutch-auth-accessory';

export default function AuthStep({
  onBack,
  title,
  hint,
  error,
  value,
  onChangeText,
  keyboardType = 'default',
  secureTextEntry = false,
  autoCapitalize = 'none',
  placeholder,
  secondValue,
  onSecondChangeText,
  secondPlaceholder,
  secondSecureTextEntry = false,
  options,
  selected,
  onSelect,
  actionLabel,
  onAction,
  ready,
  submitting,
  footer,
  notice,
  progress,
  onSkip,
}) {
  const inputRef = useRef(null);
  const secondRef = useRef(null);
  const focusedRef = useRef('first');
  const choosing = Array.isArray(options);
  const stacked = Boolean(onSecondChangeText);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const show = Keyboard.addListener(showEvent, (event) => {
      setKeyboardOpen(true);
      setKeyboardHeight(event?.endCoordinates?.height ?? 0);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardOpen(false);
      setKeyboardHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (choosing) {
      Keyboard.dismiss();
      return undefined;
    }
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [choosing, keyboardType, secureTextEntry]);

  function holdKeyboard() {
    if (focusedRef.current === 'second') secondRef.current?.focus();
    else inputRef.current?.focus();
  }

  function runAction() {
    holdKeyboard();
    if (!ready || submitting) return;
    onAction();
  }

  const actionBar = (
    <View style={styles.footer}>
      <Pressable
        style={[styles.button, ready && !submitting && styles.buttonReady]}
        onPressIn={holdKeyboard}
        onPress={runAction}
      >
        {submitting ? (
          <ActivityIndicator color="#111111" />
        ) : (
          <Text style={[styles.buttonLabel, ready && styles.buttonLabelReady]}>
            {actionLabel}
          </Text>
        )}
      </Pressable>
      {footer}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={choosing ? ['top', 'bottom'] : ['top']}>
      <StatusBar style="light" />
      <View style={styles.content}>
        <View style={styles.header}>
          <Pressable
            onPress={onBack}
            style={styles.back}
            hitSlop={8}
            accessibilityLabel="Retour"
          >
            <Ionicons name="chevron-back" size={22} color={colors.white} />
          </Pressable>
          {typeof progress === 'number' ? (
            <View
              style={styles.track}
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
            >
              <View style={[styles.fill, { width: `${Math.min(1, Math.max(0, progress)) * 100}%` }]} />
            </View>
          ) : null}
          {onSkip ? (
            <Pressable onPress={onSkip} hitSlop={8} style={styles.skip}>
              <Text style={styles.skipLabel}>Passer</Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.title}>{title}</Text>
        {choosing ? (
          <ScrollView
            style={styles.choiceScroll}
            contentContainerStyle={styles.choices}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {options.map((option) => {
              const active = selected === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => onSelect?.(option.value)}
                  style={[styles.choice, active && styles.choiceOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.choiceLabel, active && styles.choiceLabelOn]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : (
          <>
            <TextInput
              ref={inputRef}
              value={value}
              onChangeText={onChangeText}
              blurOnSubmit={false}
              autoCapitalize={autoCapitalize}
              autoCorrect={false}
              spellCheck={false}
              smartInsertDelete={false}
              autoComplete="off"
              textContentType="none"
              importantForAutofill="no"
              keyboardType={keyboardType}
              secureTextEntry={secureTextEntry}
              keyboardAppearance="dark"
              placeholder={placeholder}
              placeholderTextColor="rgba(255,255,255,0.38)"
              inputAccessoryViewID={
                Platform.OS === 'ios' && !stacked ? ACCESSORY_ID : undefined
              }
              cursorColor={colors.white}
              selectionColor="rgba(255,255,255,0.6)"
              returnKeyType="next"
              onFocus={() => {
                focusedRef.current = 'first';
              }}
              style={styles.input}
              onSubmitEditing={() => {
                if (onSecondChangeText) {
                  secondRef.current?.focus();
                  return;
                }
                runAction();
              }}
            />
            {onSecondChangeText ? (
              <TextInput
                ref={secondRef}
                value={secondValue}
                onChangeText={onSecondChangeText}
                blurOnSubmit={false}
                autoCapitalize={autoCapitalize}
                autoCorrect={false}
                spellCheck={false}
                smartInsertDelete={false}
                autoComplete="off"
                textContentType="none"
                importantForAutofill="no"
                secureTextEntry={secondSecureTextEntry}
                keyboardAppearance="dark"
                placeholder={secondPlaceholder}
                placeholderTextColor="rgba(255,255,255,0.38)"
                cursorColor={colors.white}
                selectionColor="rgba(255,255,255,0.6)"
                returnKeyType="next"
                onFocus={() => {
                  focusedRef.current = 'second';
                }}
                style={styles.input}
                onSubmitEditing={runAction}
              />
            ) : null}
          </>
        )}
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        {typeof notice === 'function' ? notice(holdKeyboard) : notice}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      {Platform.OS === 'ios' && !choosing && !stacked ? (
        <InputAccessoryView nativeID={ACCESSORY_ID} backgroundColor="#111111">
          {actionBar}
        </InputAccessoryView>
      ) : null}
      {Platform.OS === 'ios' && !choosing && !stacked && keyboardOpen ? null : (
        <View style={stacked && Platform.OS === 'ios' ? { marginBottom: keyboardHeight } : null}>
          {actionBar}
        </View>
      )}
    </SafeAreaView>
  );
}

export const authStyles = StyleSheet.create({
  link: {
    marginTop: 16,
    textAlign: 'center',
    fontSize: 15,
    color: 'rgba(255,255,255,0.82)',
  },
  linkBold: {
    color: colors.white,
    fontWeight: '700',
  },
});

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#111111',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  track: {
    flex: 1,
    height: 5,
    marginLeft: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#3DDC97',
  },
  skip: {
    marginLeft: 14,
  },
  skipLabel: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2C2C2E',
  },
  title: {
    marginTop: 28,
    color: colors.white,
    fontSize: 40,
    lineHeight: 46,
    fontWeight: '800',
  },
  input: {
    marginTop: 28,
    paddingVertical: 12,
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(255,255,255,0.55)',
    color: colors.white,
    fontSize: 22,
    fontWeight: '600',
  },
  choiceScroll: {
    flex: 1,
    marginTop: 28,
  },
  choices: {
    gap: 12,
    paddingBottom: 12,
  },
  choice: {
    minHeight: 64,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: '#1C1C1E',
  },
  choiceOn: {
    backgroundColor: colors.white,
    borderColor: colors.white,
  },
  choiceLabel: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '700',
  },
  choiceLabelOn: {
    color: '#111111',
  },
  hint: {
    marginTop: 18,
    color: '#A1A1A6',
    fontSize: 16,
    lineHeight: 23,
  },
  error: {
    marginTop: 14,
    color: '#FFE1DE',
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: '#111111',
  },
  button: {
    height: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3A3A3C',
  },
  buttonReady: {
    backgroundColor: colors.white,
  },
  buttonLabel: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 17,
    fontWeight: '700',
  },
  buttonLabelReady: {
    color: '#111111',
  },
});
