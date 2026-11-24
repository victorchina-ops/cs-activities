using System;

class Program
{
    static void Main()
    {
        int x = 10;
        x += 5; Console.WriteLine(x);
        x -= 3; Console.WriteLine(x);
        x *= 2; Console.WriteLine(x);
        x /= 5; Console.WriteLine(x);
        x %= 3; Console.WriteLine(x);
        double d = 1.5; d += 2; d *= 3; Console.WriteLine(d);
        string s = "a"; s += "b"; s += 1; s += 'c'; s += 2.5; Console.WriteLine(s);
        int y; int z; y = z = 4; Console.WriteLine(y + z);
        char c = 'a'; c += (char)1; Console.WriteLine(c);
        int w = 5; w += 'a'; Console.WriteLine(w);
    }
}
