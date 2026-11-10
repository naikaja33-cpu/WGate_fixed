
import React from "react";
import { Link } from "react-router-dom";
import { Capacitor } from "@capacitor/core";

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  // On the website the logo links to the public home page; the Android app has no such page.
  const isNative = Capacitor.isNativePlatform();
  const Brand = isNative ? "div" : Link;
  const brandProps = isNative ? {} : { to: "/", title: "Go to the WGate home page" };
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
                    <Brand {...brandProps} className="block">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary mb-4">
              <Icon className="w-7 h-7 text-primary-foreground" aria-hidden="true" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
          </Brand>
          {subtitle && <p className="text-muted-foreground mt-2">{subtitle}</p>}
        </div>
        <div className="bg-card rounded-2xl shadow-sm border border-border p-8">
          {children}
        </div>
              {footer && (
          <p className="text-center text-sm text-muted-foreground mt-6">{footer}</p>
        )}
        {/* <p className="text-center text-xs text-muted-foreground mt-4">
          <Link to="/privacy" className="underline hover:text-foreground">Privacy Policy</Link>
        </p> */}
      </div>
    </div>
  );
}
