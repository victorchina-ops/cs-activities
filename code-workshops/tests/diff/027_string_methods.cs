using System;

class Program
{
    static void Main()
    {
        string s = "Hello World";
        Console.WriteLine(s.Length);
        Console.WriteLine(s.ToUpper());
        Console.WriteLine(s.ToLower());
        Console.WriteLine(s.Substring(6));
        Console.WriteLine(s.Substring(0, 5));
        Console.WriteLine(s.IndexOf("World"));
        Console.WriteLine(s.IndexOf('z'));
        Console.WriteLine(s.Contains("lo W"));
        Console.WriteLine(s.Replace("l", "L"));
        Console.WriteLine("  pad ".Trim() + "|");
        Console.WriteLine(s.StartsWith("Hell") + " " + s.EndsWith("x"));
        Console.WriteLine("7".PadLeft(3, '0'));
        Console.WriteLine(s[0]);
        Console.WriteLine(s[4] + s[1]);
        Console.WriteLine("" + s[4] + s[1]);
        Console.WriteLine(s[s.Length - 1]);
        Console.WriteLine("abc" == "ab" + "c");
        string t = "ab"; t = t + "c";
        Console.WriteLine(t == "abc");
        Console.WriteLine(string.IsNullOrEmpty(""));
        Console.WriteLine("".Length);
    }
}
