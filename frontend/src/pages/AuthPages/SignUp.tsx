import SignUpForm from "@/components/auth/SignUpForm";
import PageMeta from "@/components/common/PageMeta";
import AuthLayout from "./AuthPageLayout";

export default function SignUp() {
  return (
    <>
      <PageMeta
        title="Create Account | GreenLoop"
        description="Create a GreenLoop account to plan material reuse and recovery."
      />
      <AuthLayout>
        <SignUpForm />
      </AuthLayout>
    </>
  );
}
