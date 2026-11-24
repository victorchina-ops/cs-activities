using System;

class Program
{
    static void Main()
    {
        Console.WriteLine(Later(5));
        Hello();
    }

    static int Later(int x)
    {
        return Helper(x) + 1;
    }

    static int Helper(int x) { return x * 10; }

    static void Hello()
    {
        Console.WriteLine("hello");
        return;
    }
}
