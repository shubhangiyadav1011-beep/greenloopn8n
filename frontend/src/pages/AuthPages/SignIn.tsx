import SignInForm from "@/components/auth/SignInForm";
import PageMeta from "@/components/common/PageMeta";
import AuthLayout from "./AuthPageLayout";

export default function SignIn() {
  return (
    <>
      <PageMeta
        title="Sign In | GreenLoop"
        description="Sign in to GreenLoop to coordinate construction material recovery."
      />
      <AuthLayout>
        <SignInForm />
      </AuthLayout>
    </>
  );
}
