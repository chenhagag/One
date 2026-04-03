import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { registerUser } from "../src/api";

const GENDER_OPTIONS = [
  { value: "man", label: "Man" },
  { value: "woman", label: "Woman" },
];

const LOOKING_FOR_OPTIONS = [
  { value: "man", label: "Men" },
  { value: "woman", label: "Women" },
  { value: "both", label: "Both" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FieldErrors {
  firstName?: string;
  email?: string;
  age?: string;
}

function validate(firstName: string, email: string, age: string): FieldErrors {
  const errors: FieldErrors = {};

  if (!firstName.trim()) {
    errors.firstName = "Name is required";
  }

  if (!email.trim()) {
    errors.email = "Email is required";
  } else if (!EMAIL_RE.test(email.trim())) {
    errors.email = "Enter a valid email address";
  }

  if (age) {
    const n = parseInt(age, 10);
    if (isNaN(n) || n < 18 || n > 120) {
      errors.age = "Age must be between 18 and 120";
    }
  }

  return errors;
}

export default function RegisterScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [lookingFor, setLookingFor] = useState("");
  const [city, setCity] = useState("");

  const handleRegister = async () => {
    setSubmitted(true);
    const errs = validate(firstName, email, age);
    setErrors(errs);

    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    try {
      await registerUser({
        first_name: firstName.trim(),
        email: email.trim().toLowerCase(),
        age: age ? parseInt(age, 10) : undefined,
        gender: gender || undefined,
        looking_for_gender: lookingFor || undefined,
        city: city.trim() || undefined,
      });
      router.replace("/success");
    } catch (err: any) {
      if (err.message?.includes("already registered")) {
        setErrors((prev) => ({ ...prev, email: "This email is already registered" }));
      } else {
        Alert.alert("Error", err.message || "Something went wrong.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Re-validate on change if user already attempted submit
  const onChangeFirstName = (v: string) => {
    setFirstName(v);
    if (submitted) setErrors((prev) => ({ ...prev, ...validate(v, email, age), firstName: validate(v, email, age).firstName }));
  };
  const onChangeEmail = (v: string) => {
    setEmail(v);
    if (submitted) setErrors((prev) => ({ ...prev, email: validate(firstName, v, age).email }));
  };
  const onChangeAge = (v: string) => {
    setAge(v);
    if (submitted) setErrors((prev) => ({ ...prev, age: validate(firstName, email, v).age }));
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading}>Create your profile</Text>

        <Text style={styles.label}>First name *</Text>
        <TextInput
          style={[styles.input, errors.firstName && styles.inputError]}
          value={firstName}
          onChangeText={onChangeFirstName}
          placeholder="Your first name"
          autoCapitalize="words"
        />
        {errors.firstName && <Text style={styles.errorText}>{errors.firstName}</Text>}

        <Text style={styles.label}>Email *</Text>
        <TextInput
          style={[styles.input, errors.email && styles.inputError]}
          value={email}
          onChangeText={onChangeEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}

        <Text style={styles.label}>Age</Text>
        <TextInput
          style={[styles.input, errors.age && styles.inputError]}
          value={age}
          onChangeText={onChangeAge}
          placeholder="Your age"
          keyboardType="numeric"
          maxLength={3}
        />
        {errors.age && <Text style={styles.errorText}>{errors.age}</Text>}

        <Text style={styles.label}>I am</Text>
        <View style={styles.optionRow}>
          {GENDER_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              style={[
                styles.optionButton,
                gender === opt.value && styles.optionSelected,
              ]}
              onPress={() => setGender(opt.value)}
            >
              <Text
                style={[
                  styles.optionText,
                  gender === opt.value && styles.optionTextSelected,
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Looking for</Text>
        <View style={styles.optionRow}>
          {LOOKING_FOR_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              style={[
                styles.optionButton,
                lookingFor === opt.value && styles.optionSelected,
              ]}
              onPress={() => setLookingFor(opt.value)}
            >
              <Text
                style={[
                  styles.optionText,
                  lookingFor === opt.value && styles.optionTextSelected,
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>City</Text>
        <TextInput
          style={styles.input}
          value={city}
          onChangeText={setCity}
          placeholder="Your city"
        />

        <Pressable
          style={[styles.submitButton, loading && styles.submitDisabled]}
          onPress={handleRegister}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>Register</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    paddingBottom: 48,
    backgroundColor: "#F5F5FF",
  },
  heading: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#555",
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
  },
  inputError: {
    borderColor: "#E53935",
  },
  errorText: {
    color: "#E53935",
    fontSize: 13,
    marginTop: 4,
  },
  optionRow: {
    flexDirection: "row",
    gap: 10,
  },
  optionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fff",
    alignItems: "center",
  },
  optionSelected: {
    backgroundColor: "#6C63FF",
    borderColor: "#6C63FF",
  },
  optionText: {
    fontSize: 15,
    color: "#333",
  },
  optionTextSelected: {
    color: "#fff",
    fontWeight: "600",
  },
  submitButton: {
    backgroundColor: "#6C63FF",
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: "center",
    marginTop: 32,
  },
  submitDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
});
